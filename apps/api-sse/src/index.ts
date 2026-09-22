import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import {
  AdminNotificationPayload,
  ClientStatus,
  ClientTokenPayload,
  REDIS_CHANNELS,
  REDIS_KEYS
} from '@sse-showcase/shared-types';

dotenv.config();

const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-sse-showcase';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const app = express();
app.use(cors());
app.use(express.json());

// Redis para comandos de estado (Keys, Sets, Hashes, Publish)
const redisCmd = new Redis(REDIS_URL);
// Redis dedicado exclusivamente para modo Subscriber (Pub/Sub)
const redisSub = new Redis(REDIS_URL);

redisCmd.on('connect', () => console.log('[API 2 - SSE] Redis Command client conectado.'));
redisSub.on('connect', () => console.log('[API 2 - SSE] Redis Subscriber client conectado.'));

// Mapa em memória com conexões ativas: clientId -> Set de Response (permite múltiplas abas se necessário)
const clientConnections = new Map<string, Set<Response>>();
// Conexões ativas do painel de administração
const adminConnections = new Set<Response>();

// Inscreve o subscriber do Redis nos canais globais
redisSub.subscribe(REDIS_CHANNELS.BROADCAST, REDIS_CHANNELS.ADMIN_EVENTS, (err, count) => {
  if (err) {
    console.error('[API 2 - SSE] Erro ao subscrever canais globais:', err);
  } else {
    console.log(`[API 2 - SSE] Subscrito em ${count} canal(is) global(is).`);
  }
});

// Listener central para mensagens recebidas do Redis
redisSub.on('message', (channel: string, message: string) => {
  // 1. Mensagem de Broadcast para todos os clientes
  if (channel === REDIS_CHANNELS.BROADCAST) {
    for (const responses of clientConnections.values()) {
      for (const res of responses) {
        res.write(`event: message\ndata: ${message}\n\n`);
      }
    }
  }

  // 2. Mensagem direcionada a um cliente específico
  else if (channel.startsWith('events:client:')) {
    const targetClientId = channel.replace('events:client:', '');
    const responses = clientConnections.get(targetClientId);
    if (responses) {
      for (const res of responses) {
        res.write(`event: message\ndata: ${message}\n\n`);
      }
    }
  }

  // 3. Notificação de ciclo de vida para os painéis de Admin
  else if (channel === REDIS_CHANNELS.ADMIN_EVENTS) {
    for (const res of adminConnections) {
      res.write(`event: admin_notification\ndata: ${message}\n\n`);
    }
  }
});

/**
 * Healthcheck
 */
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const ping = await redisCmd.ping();
    res.json({
      status: 'ok',
      service: 'api-sse',
      redis: ping,
      activeClients: clientConnections.size,
      activeAdmins: adminConnections.size
    });
  } catch (error) {
    res.status(503).json({ status: 'error', message: 'Redis indisponível', error });
  }
});

/**
 * Rota SSE para o Cliente (Web Client)
 * Autenticação via Query Param: /sse/events?token=<token>
 */
app.get('/sse/events', async (req: Request, res: Response) => {
  const token = req.query.token as string | undefined;

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido via query parameter (?token=)' });
  }

  let payload: ClientTokenPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as ClientTokenPayload;
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }

  const { clientId, clientName } = payload;
  const clientChannel = REDIS_CHANNELS.clientChannel(clientId);

  // Configura cabeçalhos do stream SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();

  // Registra a resposta na estrutura de conexões
  if (!clientConnections.has(clientId)) {
    clientConnections.set(clientId, new Set());
    // Inscreve a API no canal específico deste cliente
    redisSub.subscribe(clientChannel, (err) => {
      if (err) console.error(`[API 2 - SSE] Erro ao subscrever canal ${clientChannel}:`, err);
    });
  }
  clientConnections.get(clientId)!.add(res);

  const clientStatus: ClientStatus = {
    clientId,
    clientName,
    connectedAt: new Date().toISOString(),
    ip: req.ip
  };

  // Salva estado volátil no Redis
  await redisCmd.sadd(REDIS_KEYS.ACTIVE_CLIENTS_SET, clientId);
  await redisCmd.hset(REDIS_KEYS.CLIENT_DETAILS_HASH, clientId, JSON.stringify(clientStatus));

  // Notifica o canal admin sobre a nova conexão
  const connectNotification: AdminNotificationPayload = {
    type: 'client:connected',
    client: clientStatus,
    timestamp: new Date().toISOString()
  };
  await redisCmd.publish(REDIS_CHANNELS.ADMIN_EVENTS, JSON.stringify(connectNotification));

  // Envia evento inicial de confirmação para o cliente
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId, clientName, status: 'online' })}\n\n`);

  // Keep-alive a cada 15 segundos para evitar timeouts de proxies
  const heartbeat = setInterval(() => {
    res.write(':keepalive\n\n');
  }, 15000);

  // Limpeza e teardown na desconexão
  req.on('close', async () => {
    clearInterval(heartbeat);

    const responses = clientConnections.get(clientId);
    if (responses) {
      responses.delete(res);
      if (responses.size === 0) {
        clientConnections.delete(clientId);
        // Cancela subscrição do canal no Redis
        redisSub.unsubscribe(clientChannel);

        // Remove do Redis
        await redisCmd.srem(REDIS_KEYS.ACTIVE_CLIENTS_SET, clientId);
        await redisCmd.hdel(REDIS_KEYS.CLIENT_DETAILS_HASH, clientId);

        // Notifica painel de Admin sobre a desconexão
        const disconnectNotification: AdminNotificationPayload = {
          type: 'client:disconnected',
          client: clientStatus,
          timestamp: new Date().toISOString()
        };
        await redisCmd.publish(REDIS_CHANNELS.ADMIN_EVENTS, JSON.stringify(disconnectNotification));
        console.log(`[API 2 - SSE] Cliente desconectado: ${clientName} (${clientId})`);
      }
    }
  });
});

/**
 * Rota SSE para o Painel Administrativo (Web Admin)
 * Recebe atualizações em tempo real do ciclo de vida dos clientes
 */
app.get('/sse/admin', async (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();

  adminConnections.add(res);

  // Envia lista atual de clientes conectados imediatamente
  try {
    const clientDetails = await redisCmd.hgetall(REDIS_KEYS.CLIENT_DETAILS_HASH);
    const clients: ClientStatus[] = Object.values(clientDetails).map((item) => JSON.parse(item));
    res.write(`event: initial_clients\ndata: ${JSON.stringify(clients)}\n\n`);
  } catch (error) {
    console.error('[API 2 - SSE] Erro ao carregar clientes iniciais para o Admin:', error);
  }

  const heartbeat = setInterval(() => {
    res.write(':keepalive\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    adminConnections.delete(res);
  });
});

const server = app.listen(PORT, () => {
  console.log(`[API 2 - SSE] Servidor iniciado na porta ${PORT}`);
});

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('[API 2 - SSE] Encerrando serviço...');
  server.close(async () => {
    // Limpa estado no Redis
    try {
      const activeIds = Array.from(clientConnections.keys());
      if (activeIds.length > 0) {
        await redisCmd.del(REDIS_KEYS.ACTIVE_CLIENTS_SET);
        await redisCmd.del(REDIS_KEYS.CLIENT_DETAILS_HASH);
      }
    } catch (_) {}

    redisSub.disconnect();
    redisCmd.disconnect();
    console.log('[API 2 - SSE] Conexões Redis finalizadas.');
    process.exit(0);
  });
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
