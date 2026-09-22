import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import Redis from 'ioredis';
import {
  ChatMessagePayload,
  ClientTokenPayload,
  ClientStatus,
  REDIS_CHANNELS,
  REDIS_KEYS
} from '@sse-showcase/shared-types';

dotenv.config();

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-sse-showcase';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const app = express();
app.use(cors());
app.use(express.json());

// Redis publisher client
const redis = new Redis(REDIS_URL, {
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  }
});

redis.on('connect', () => {
  console.log('[API 1 - Auth] Conectado ao Redis com sucesso.');
});

redis.on('error', (err) => {
  console.error('[API 1 - Auth] Erro na conexão com o Redis:', err);
});

// Schema de validação para emissão de token
const tokenRequestSchema = z.object({
  clientName: z.string().trim().min(2, 'O nome deve ter no mínimo 2 caracteres').max(50)
});

// Schema de validação para publicação de mensagens
const publishMessageSchema = z.object({
  sender: z.string().trim().min(1, 'Remetente obrigatório'),
  content: z.string().trim().min(1, 'Conteúdo da mensagem não pode ser vazio'),
  targetClientId: z.string().trim().optional()
});

/**
 * Healthcheck
 */
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const ping = await redis.ping();
    res.json({ status: 'ok', service: 'api-auth', redis: ping });
  } catch (error) {
    res.status(503).json({ status: 'error', message: 'Redis unavailable', error });
  }
});

/**
 * Rota para emissão de token de cliente
 */
app.post('/auth/token', (req: Request, res: Response) => {
  const parseResult = tokenRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ errors: parseResult.error.flatten().fieldErrors });
  }

  const { clientName } = parseResult.data;
  const clientId = uuidv4();

  const payload: ClientTokenPayload = {
    clientId,
    clientName,
    role: 'client'
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

  return res.status(201).json({
    token,
    clientId,
    clientName
  });
});

/**
 * Rota para publicação de mensagens no Redis (Admin ou broadcast)
 */
app.post('/messages/publish', async (req: Request, res: Response) => {
  const parseResult = publishMessageSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ errors: parseResult.error.flatten().fieldErrors });
  }

  const { sender, content, targetClientId } = parseResult.data;
  const message: ChatMessagePayload = {
    id: uuidv4(),
    sender,
    content,
    timestamp: new Date().toISOString(),
    targetClientId
  };

  try {
    const channel = targetClientId
      ? REDIS_CHANNELS.clientChannel(targetClientId)
      : REDIS_CHANNELS.BROADCAST;

    const receiversCount = await redis.publish(channel, JSON.stringify(message));

    return res.status(200).json({
      success: true,
      message,
      channel,
      subscribersNotified: receiversCount
    });
  } catch (error) {
    console.error('[API 1 - Auth] Falha ao publicar mensagem no Redis:', error);
    return res.status(500).json({ error: 'Falha ao despachar mensagem' });
  }
});

/**
 * Rota para listar clientes ativos cadastrados no Redis
 */
app.get('/clients', async (_req: Request, res: Response) => {
  try {
    const clientDetails = await redis.hgetall(REDIS_KEYS.CLIENT_DETAILS_HASH);
    const clients: ClientStatus[] = Object.values(clientDetails).map((item) => JSON.parse(item));
    return res.json(clients);
  } catch (error) {
    console.error('[API 1 - Auth] Erro ao buscar clientes:', error);
    return res.status(500).json({ error: 'Erro ao consultar clientes' });
  }
});

const server = app.listen(PORT, () => {
  console.log(`[API 1 - Auth] Servidor iniciado na porta ${PORT}`);
});

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('[API 1 - Auth] Encerrando serviço...');
  server.close(() => {
    redis.disconnect();
    console.log('[API 1 - Auth] Serviço finalizado.');
    process.exit(0);
  });
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
