import Fastify from 'fastify';
import cors from '@fastify/cors';

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
  credentials: true
});

app.get('/health', async () => ({
  status: 'ok',
  service: 'tehkarta-api',
  version: '0.1.0'
}));

app.get('/api/v1/platform', async () => ({
  product: 'Tehkarta',
  architecture: 'course-section-lesson',
  principle: 'AI proposes, teacher decides'
}));

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';

await app.listen({ port, host });
