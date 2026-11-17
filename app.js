import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { driver, verifyConnection } from "./src/config/neo4j.js";
import { initConstraints } from "./src/config/initDb.js";

import indexRoutes from "./src/routes/testeIndex.js";
import authRoutes from './src/routes/authRoutes.js'
import gameRoutes from './src/routes/gameRoutes.js';
import socialRoutes from './src/routes/socialRoutes.js'

import { requireAuth, checkUser } from "./src/middlewares/authMiddleware.js";

const app = express();
const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

app.set("view engine", "ejs");
app.set("views", path.join(currentDirectory, "src", "views"));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(currentDirectory, "src", "public")));

app.use(checkUser);

// Rotas
app.get('/', (req, res) => {
  res.render('index');
});

app.use("/", indexRoutes);
app.use('/auth', authRoutes);
app.use('/games', gameRoutes);
app.use('/', socialRoutes);



const PORT = process.env.PORT || 3000;

const startServer = async () => {
  await verifyConnection(); 
  await initConstraints();

  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
};

startServer();

process.on('SIGINT', async () => {
  await driver.close();
  console.log('Conexão com Neo4j encerrada.');
  process.exit(0);
});