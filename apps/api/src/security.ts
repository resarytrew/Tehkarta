import { createHmac } from 'node:crypto';

function keyedHash(namespace: string, value: string, key: string): string {
  return createHmac('sha256', key)
    .update(namespace)
    .update('\0')
    .update(value)
    .digest('hex');
}

export function hashClientIp(ip: string, key: string): string {
  return keyedHash('tehkarta:client-ip:v1', ip, key);
}

export function hashLoginPrincipal(normalizedEmail: string, key: string): string {
  return keyedHash('tehkarta:login-principal:v1', normalizedEmail, key);
}
