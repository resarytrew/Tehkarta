import { createHmac } from 'node:crypto';

export function hashClientIp(ip: string, key: string): string {
  return createHmac('sha256', key)
    .update('tehkarta:client-ip:v1')
    .update('\0')
    .update(ip)
    .digest('hex');
}
