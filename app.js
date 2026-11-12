import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import indexRoutes from "./src/routes/testeIndex.js";

import { driver, verifyConnection } from "./src/config/neo4j.js";
import { initConstraints } from "./src/config/initDb.js";

const app = express();
const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

app.set("view engine", "ejs");
app.set("views", path.join(currentDirectory, "src", "views"));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(currentDirectory, "public")));
app.use("/", indexRoutes);

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