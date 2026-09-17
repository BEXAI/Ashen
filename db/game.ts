import { env } from 'cloudflare:workers';
export function gameDb() {
  if(!env.DB) throw new Error('Game storage unavailable');
  return env.DB;
}
