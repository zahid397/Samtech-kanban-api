import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpgradeInterestDto } from '../src/workspace/subscription.dto';

test('plan interest requires a supported future plan and explicit boolean approval', async () => {
  for (const input of [
    { plan: 'ENTERPRISE', approved: false },
    { plan: 'PRO', approved: 'true' },
    { plan: 'ADMIN', approved: true },
    { plan: 'STARTER', approved: true },
    { plan: 'PRO' },
  ]) {
    assert.ok((await validate(plainToInstance(UpgradeInterestDto, input))).length > 0);
  }
  assert.equal(
    (await validate(plainToInstance(UpgradeInterestDto, { plan: 'PRO', approved: true }))).length,
    0,
  );
});
