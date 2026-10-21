import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTaskDto } from '../src/tasks/dto/create-task.dto';
import { UpdateTaskDto } from '../src/tasks/dto/update-task.dto';

test('task DTO rejects impossible dates and null required fields while allowing deadline removal', async () => {
  const invalidDate = await validate(plainToInstance(CreateTaskDto, { title: 'Review', dueDate: '2026-02-31' }));
  assert.ok(invalidDate.some(error => error.property === 'dueDate'));
  const invalidTitle = await validate(plainToInstance(UpdateTaskDto, { title: null }));
  assert.ok(invalidTitle.some(error => error.property === 'title'));
  const invalidPriority = await validate(plainToInstance(UpdateTaskDto, { priority: null }));
  assert.ok(invalidPriority.some(error => error.property === 'priority'));
  assert.equal((await validate(plainToInstance(UpdateTaskDto, { dueDate: null }))).length, 0);
});
