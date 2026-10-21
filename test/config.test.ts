import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateEnvironment} from '../src/config';
const base={JWT_SECRET:'a'.repeat(40),DATABASE_URL:'postgresql://localhost/example'};
test('configuration rejects wildcard credential origins, weak secrets and invalid ports',()=>{
  assert.throws(()=>validateEnvironment({...base,CORS_ORIGIN:'*'}));
  assert.throws(()=>validateEnvironment({...base,JWT_SECRET:'weak'}));
  assert.throws(()=>validateEnvironment({...base,PORT:'NaN'}));
  assert.equal(validateEnvironment(base).PORT,5000);
});
