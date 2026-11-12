import { getSession } from './neo4j.js';

export const initConstraints = async () => {
  const session = getSession();
  try {
    await session.run(`
      CREATE CONSTRAINT user_id_unique IF NOT EXISTS
      FOR (u:User) REQUIRE u.id IS UNIQUE
    `);

    await session.run(`
      CREATE CONSTRAINT user_email_unique IF NOT EXISTS
      FOR (u:User) REQUIRE u.email IS UNIQUE
    `);

    await session.run(`
      CREATE CONSTRAINT user_username_unique IF NOT EXISTS
      FOR (u:User) REQUIRE u.username IS UNIQUE
    `);

    await session.run(`
      CREATE CONSTRAINT game_igdbId_unique IF NOT EXISTS
      FOR (g:Game) REQUIRE g.igdbId IS UNIQUE
    `);

    console.log('Constraints do Neo4j verificadas/criadas.');
  } catch (error) {
    console.error('Erro ao criar constraints:', error.message);
  } finally {
    await session.close();
  }
};