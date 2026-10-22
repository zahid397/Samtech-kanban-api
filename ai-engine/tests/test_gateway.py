"""Gateway protocol/security boundaries use a mock transport; no paid requests."""
import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient
from app import main


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(main, "KEY", "gateway-test-service-key-at-least-32-chars")
    monkeypatch.setenv("AI_PROVIDER", "neon")
    monkeypatch.setenv("NEON_AI_GATEWAY_BASE_URL", "https://br-test-api.ai.c-3.ap-southeast-1.aws.neon.tech")
    monkeypatch.setenv("NEON_AI_GATEWAY_TOKEN", "test-credential-not-real")
    monkeypatch.setenv("NEON_AI_GATEWAY_MODEL", "chosen-catalog-model")
    monkeypatch.delenv("OLLAMA_MODEL", raising=False)


def transport(monkeypatch, handler):
    original = httpx.AsyncClient
    def client(**kwargs):
        return original(transport=httpx.MockTransport(handler), **kwargs)
    monkeypatch.setattr(main.httpx, "AsyncClient", client)


def completion(content=None, **message):
    return {"choices": [{"finish_reason": "stop", "message": {
        "content": json.dumps({"drafts": [{"title": "Review gateway", "priority": "HIGH"}]}) if content is None else content,
        **message,
    }}]}


def test_gateway_uses_server_credential_explicit_model_and_bounded_completion(configured, monkeypatch):
    calls = []
    def handler(request):
        calls.append(request)
        payload = json.loads(request.content)
        assert str(request.url).endswith("/v1/chat/completions")
        assert request.headers["authorization"] == "Bearer test-credential-not-real"
        assert payload["model"] == "chosen-catalog-model"
        assert payload["max_tokens"] == 600 and payload["stream"] is False
        assert "tools" not in payload and "tool_choice" not in payload
        assert payload["messages"][1] == {"role": "user", "content": "Create a task"}
        return httpx.Response(200, json=completion())
    transport(monkeypatch, handler)
    result = asyncio.run(main.neon_drafts(main.Input(text="Create a task")))
    assert result[0]["title"] == "Review gateway"
    assert len(calls) == 1


@pytest.mark.parametrize("url", [
    "http://br-test-api.ai.ap-southeast-1.aws.neon.tech",
    "https://br-test-api.ai.ap-southeast-1.aws.neon.tech/v1",
    "https://br-test-api.ai.ap-southeast-1.aws.neon.tech?token=x",
    "https://br-test-api.ai.ap-southeast-1.aws.neon.tech.evil.test",
    "https://example.test", "https://user:password@br-test-api.ai.ap-southeast-1.aws.neon.tech",
])
def test_gateway_refuses_credential_forwarding_to_unexpected_origins(configured, monkeypatch, url):
    monkeypatch.setenv("NEON_AI_GATEWAY_BASE_URL", url)
    with pytest.raises(ValueError):
        main.gateway_configuration()


@pytest.mark.parametrize("envelope", [
    {"choices": []}, {"choices": [None]}, {"choices": [{"message": None}]},
    {"choices": [{"finish_reason": "length", "message": {"content": "{}"}}]},
    completion(json.dumps({"drafts": [{"title": "Bad date", "dueDate": "2026-02-31"}]})),
    completion(json.dumps({"drafts": [{"title": "Tool", "shell": "anything"}]})),
    completion(json.dumps({"drafts": [{"title": "A"}] * 9})),
    completion(tool_calls=[{"function": {"name": "create_task"}}]),
])
def test_gateway_drafts_are_validated_and_never_execute_tools(configured, monkeypatch, envelope):
    transport(monkeypatch, lambda _: httpx.Response(200, json=envelope))
    with pytest.raises((ValueError, KeyError, TypeError)):
        asyncio.run(main.neon_drafts(main.Input(text="Create a task")))


def test_gateway_supports_documented_text_content_blocks(configured, monkeypatch):
    transport(monkeypatch, lambda _: httpx.Response(200, json=completion([
        {"type": "text", "text": '{"drafts":['},
        {"type": "text", "text": '{"title":"Review model output"}]}'},
    ])))
    assert asyncio.run(main.neon_drafts(main.Input(text="Task")))[0]["title"] == "Review model output"


def test_gateway_stream_is_bounded_before_json_decoding(configured, monkeypatch):
    class Chunks(httpx.AsyncByteStream):
        count = 0
        closed = False
        async def __aiter__(self):
            for _ in range(100):
                self.count += 1
                yield b"x" * 16_384
        async def aclose(self):
            self.closed = True
    chunks = Chunks()
    transport(monkeypatch, lambda _: httpx.Response(200, stream=chunks))
    with pytest.raises(ValueError, match="too large"):
        asyncio.run(main.neon_drafts(main.Input(text="Task")))
    assert chunks.count < 10 and chunks.closed


@pytest.mark.parametrize("failure", ["timeout", "rate-limit"])
def test_gateway_failure_falls_back_without_retries_or_secret_leaks(configured, monkeypatch, failure):
    calls = []
    def handler(request):
        calls.append(request)
        if failure == "timeout":
            raise httpx.ReadTimeout("upstream test-credential-not-real", request=request)
        return httpx.Response(429, json={"error": {"message": "private upstream detail"}})
    transport(monkeypatch, handler)
    with TestClient(main.app) as client:
        response = client.post("/analyze", headers={"x-service-key": main.KEY}, json={"text": "Create a task called Fix Login"})
    assert response.status_code == 200 and response.json()["mode"] == "lightweight"
    assert "test-credential-not-real" not in response.text and "private upstream detail" not in response.text
    assert any("Neon AI Gateway unavailable" in item for item in response.json()["explanations"])
    assert len(calls) == 1


def test_gateway_mode_describes_only_actual_execution(configured, monkeypatch):
    transport(monkeypatch, lambda _: httpx.Response(200, json=completion()))
    with TestClient(main.app) as client:
        health = client.get("/health").json()
        assert health["aiGateway"] == {"selected": True, "availability": "configured-not-checked"}
        result = client.post("/analyze", headers={"x-service-key": main.KEY}, json={"text": "Create a task"}).json()
    assert result["mode"] == "neon" and result["engine"] == "chosen-catalog-model"
    assert "Neon AI Gateway" in result["disclaimer"]


def test_pulled_gateway_credentials_alone_never_enable_paid_calls(configured, monkeypatch):
    monkeypatch.delenv("AI_PROVIDER")
    def unexpected(_):
        raise AssertionError("Model calls require explicit provider selection")
    transport(monkeypatch, unexpected)
    with TestClient(main.app) as client:
        result = client.post("/analyze", headers={"x-service-key": main.KEY}, json={"text": "Create a task"}).json()
    assert result["mode"] == "lightweight"
