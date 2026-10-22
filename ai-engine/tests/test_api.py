import asyncio
import json
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient
from app import main

KEY='sammtech-ai-local-test-key-at-least-32-chars'
AUTH={'x-service-key':KEY}

@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(main,'KEY',KEY)
    for name in ['AI_PROVIDER','NEON_AI_GATEWAY_BASE_URL','NEON_AI_GATEWAY_TOKEN','NEON_AI_GATEWAY_MODEL','OLLAMA_MODEL','EMBEDDING_MODEL_PATH','WHISPER_MODEL_PATH','PIPER_MODEL_PATH']:
        monkeypatch.delenv(name,raising=False)
    with TestClient(main.app) as client:
        yield client

def test_analysis_requires_key_before_parsing_body(client):
    assert client.post('/analyze',content='not json').status_code==401
    assert client.post('/analyze',headers={'x-service-key':'unauthorized-☃'.encode('utf-8').hex()},json={}).status_code==401
    assert client.post('/voice/speak',json={'text':'Hello'}).status_code==401
    response=client.post('/analyze',headers=AUTH,json={'text':'Create a task called Fix Login Bug'})
    assert response.status_code==200
    assert response.json()['drafts'][0]['title']=='Fix Login Bug'

def test_malformed_and_oversized_requests_are_bounded(client):
    response=client.post('/analyze',headers=AUTH,json={'text':'x'*4001})
    assert response.status_code==422
    assert len(response.content)<1000
    assert 'input' not in response.json()['detail'][0]
    response=client.post('/analyze',headers={**AUTH,'content-length':'12000001'},content='{}')
    assert response.status_code==413
    assert client.post('/analyze',headers=AUTH,json={'tasks':[{'id':'a','title':'task','dueDate':'bad'}]}).status_code==422
    assert client.post('/analyze',headers=AUTH,json={'shell':'rm -rf /'}).status_code==422

def test_health_distinguishes_configuration_from_loaded_models(client,monkeypatch,tmp_path):
    monkeypatch.setenv('OLLAMA_MODEL','not-verified')
    monkeypatch.setenv('EMBEDDING_MODEL_PATH',str(tmp_path/'missing'))
    result=client.get('/health').json()
    assert result['localModel']['availability']=='not-checked'
    assert result['embeddings'] is False
    assert result['capabilities']['semanticSearch']=='unavailable'

def test_optional_models_fail_softly(client,monkeypatch):
    monkeypatch.setenv('OLLAMA_MODEL','local-test')
    async def invalid(_): raise ValueError('bad model output')
    monkeypatch.setattr(main,'local_drafts',invalid)
    response=client.post('/analyze',headers=AUTH,json={'text':'Fix login'})
    assert response.status_code==200
    assert response.json()['mode']=='lightweight'
    assert any('invalid output' in reason for reason in response.json()['explanations'])
    monkeypatch.setenv('EMBEDDING_MODEL_PATH','/nonexistent/local-model')
    response=client.post('/analyze',headers=AUTH,json={'kind':'search','text':'login','tasks':[{'id':'a','title':'Fix login'}]})
    assert response.status_code==200
    assert response.json()['matches'][0]['method']=='lexical TF-IDF'

def test_unconfigured_voice_is_explicit(client):
    assert client.post('/voice/transcribe',headers=AUTH,json={'audio':'YWJj'}).status_code==503
    assert client.post('/voice/speak',headers=AUTH,json={'text':'Hello'}).status_code==503

def test_invalid_audio_is_rejected_before_loading_model(client,monkeypatch,tmp_path):
    monkeypatch.setenv('WHISPER_MODEL_PATH',str(tmp_path))
    assert client.post('/voice/transcribe',headers=AUTH,json={'audio':'%not-base64'}).status_code==400

@pytest.mark.parametrize('drafts',[[{'title':'A','dueDate':'nonsense'}],[],[{'title':'A'}]*9,{'title':'A'}])
def test_local_model_output_schema_and_count(monkeypatch,drafts):
    monkeypatch.setenv('OLLAMA_MODEL','model-already-installed')
    original=httpx.AsyncClient
    def handler(_request):
        return httpx.Response(200,json={'response':json.dumps({'drafts':drafts})})
    def client(**kwargs): return original(transport=httpx.MockTransport(handler),**kwargs)
    monkeypatch.setattr(main.httpx,'AsyncClient',client)
    with pytest.raises((ValueError,TypeError)):
        asyncio.run(main.local_drafts(main.Input(text='Create a task')))

def test_local_model_response_size_limit(monkeypatch):
    monkeypatch.setenv('OLLAMA_MODEL','installed')
    original=httpx.AsyncClient
    def client(**kwargs):return original(transport=httpx.MockTransport(lambda _:httpx.Response(200,content=b'x'*(main.MAX_MODEL_RESPONSE_BYTES+1))),**kwargs)
    monkeypatch.setattr(main.httpx,'AsyncClient',client)
    with pytest.raises(ValueError,match='too large'):
        asyncio.run(main.local_drafts(main.Input(text='Task')))

def test_cancelled_worker_keeps_its_capacity_until_finished():
    async def scenario():
        started=threading.Event();release=threading.Event()
        def slow():started.set();release.wait(2);return 'finished'
        state=SimpleNamespace(cpu_slots=asyncio.Semaphore(1),pool=ThreadPoolExecutor(max_workers=1))
        request=SimpleNamespace(app=SimpleNamespace(state=state))
        task=asyncio.create_task(main.cpu_work(request,slow))
        try:
            for _ in range(50):
                if started.is_set():break
                await asyncio.sleep(.01)
            assert started.is_set()
            task.cancel()
            with pytest.raises(asyncio.CancelledError):await task
            assert state.cpu_slots.locked()
            release.set()
            for _ in range(50):
                if not state.cpu_slots.locked():break
                await asyncio.sleep(.01)
            assert not state.cpu_slots.locked()
        finally:release.set();state.pool.shutdown(wait=True)
    asyncio.run(scenario())


def test_local_greeting_does_not_become_a_task(client,monkeypatch):
    monkeypatch.setenv('OLLAMA_MODEL','installed')
    async def unexpected(_):raise AssertionError('A greeting must not invoke local task generation')
    monkeypatch.setattr(main,'local_drafts',unexpected)
    response=client.post('/analyze',headers=AUTH,json={'text':'Hello SammTech.'})
    assert response.status_code==200
    assert response.json()['drafts']==[]

def test_local_model_mode_and_disclaimer_match_actual_execution(client,monkeypatch):
    monkeypatch.setenv('OLLAMA_MODEL','installed')
    async def output(_):return [{'title':'Fix login','description':'','priority':'MEDIUM','dueDate':None,'estimateMinutes':60}]
    monkeypatch.setattr(main,'local_drafts',output)
    result=client.post('/analyze',headers=AUTH,json={'text':'Fix login'}).json()
    assert result['mode']=='local'
    assert result['engine']=='installed'
    assert 'Local model' in result['disclaimer']


def test_speech_output_is_bounded_during_generation(client,monkeypatch,tmp_path):
    model=tmp_path/'voice.onnx'
    model.touch()
    monkeypatch.setenv('PIPER_MODEL_PATH',str(model))
    monkeypatch.setattr(main,'MAX_SPEECH_BYTES',256)
    monkeypatch.setattr(main,'_piper_voice',None)
    calls=[]

    class Voice:
        @staticmethod
        def load(_path):return Voice()

        def synthesize_wav(self,_text,wav):
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(22050)
            for _ in range(100):
                calls.append('chunk')
                wav.writeframes(b'\0'*128)

    monkeypatch.setitem(sys.modules,'piper',SimpleNamespace(PiperVoice=Voice))
    response=client.post('/voice/speak',headers=AUTH,json={'text':'Hello'})
    assert response.status_code==413
    assert len(calls)==2
    assert len(response.content)<200
