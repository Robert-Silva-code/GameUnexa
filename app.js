import "dotenv/config";
import express from "express";
import { createServer } from 'http';
import { Server } from "socket.io";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

import { driver, verifyConnection, getSession } from "./src/config/neo4j.js";
import { initConstraints } from "./src/config/initDb.js";

import indexRoutes from "./src/routes/testeIndex.js";
import authRoutes from './src/routes/authRoutes.js'
import gameRoutes from './src/routes/gameRoutes.js';
import socialRoutes from './src/routes/socialRoutes.js';
import userRoutes from './src/routes/userRoutes.js';
import messageRoutes from './src/routes/messageRoutes.js'

import { requireAuth, checkUser } from "./src/middlewares/authMiddleware.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

app.set("view engine", "ejs");
app.set("views", path.join(currentDirectory, "src", "views"));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(currentDirectory, "src", "public")));

app.use(checkUser);

app.get('/', (req, res) => {
  res.render('index');
});

app.use("/", indexRoutes);
app.use('/auth', authRoutes);
app.use('/games', gameRoutes);
app.use('/user', userRoutes);
app.use('/', socialRoutes);
app.use('/messages', messageRoutes);

io.use((socket, next) => {
  const cookieHeader = socket.handshake.headers.cookie || '';
  const tokenCookie = cookieHeader
    .split('; ')
    .find(row => row.startsWith('token='));

  if (!tokenCookie) {
    return next(new Error('Não autenticado'));
  }

  const token = tokenCookie.split('=')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error('Token inválido'));
  }
});

io.on('connection', (socket) => {
  const me = socket.user;

  socket.join(me.username);

  socket.on('private_message', async ({ toUsername, text }) => {
    if (!toUsername || !text || !text.trim() || toUsername === me.username) return;

    const session = getSession();
    try {
      const msgId = uuidv4();
      const cleanText = text.trim();

      const result = await session.run(
        `
        MATCH (sender:User { id: $senderId }), (receiver:User { username: $toUsername })
        CREATE (m:Message {
          id: $msgId,
          text: $text,
          createdAt: datetime()
        })
        CREATE (sender)-[:SENT]->(m)-[:TO]->(receiver)
        RETURN toString(m.createdAt) AS createdAt
        `,
        {
          senderId: me.id,
          toUsername,
          msgId,
          text: cleanText
        }
      );

      if (result.records.length === 0) return;

      const payload = {
        id: msgId,
        text: cleanText,
        senderUsername: me.username,
        toUsername,
        createdAt: result.records[0].get('createdAt')
      };

      io.to(toUsername).emit('new_message', payload);
      io.to(me.username).emit('new_message', payload);
    } catch (error) {
      console.error('Erro ao salvar/enviar mensagem via Socket.io:', error);
    } finally {
      await session.close();
    }
  });
});


const PORT = process.env.PORT || 3000;

const startServer = async () => {
  await verifyConnection(); 
  await initConstraints();

  httpServer.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
};

startServer();

process.on('SIGINT', async () => {
  await driver.close();
  console.log('Conexão com Neo4j encerrada.');
  process.exit(0);
});