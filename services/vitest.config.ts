import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    // The modules under test read config at import time; give them something
    // valid so a test failure is about logic, not a missing variable.
    env: {
      TABLE_NAME: 'pilcrow-test',
      COGNITO_USER_POOL_ID: 'us-east-1_test',
      COGNITO_CLIENT_ID: 'testclient',
      ELEVENLABS_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:000000000000:secret:test',
      AWS_REGION: 'us-east-1',
    },
  },
})
