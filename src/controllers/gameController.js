import { v4 as uuidv4 } from 'uuid';
import { searchGames } from '../config/igdb.js';
import { getSession } from '../config/neo4j.js';

export const renderCatalog = async (req, res) => {
  const query = req.query.q || '';
  const userId = req.user.id;
  const session = getSession();

  try {
    const games = await searchGames(query);
    const igdbIds = games.map(g => g.igdbId);

    const result = await session.run(
      `
      UNWIND $igdbIds AS gid
      OPTIONAL MATCH (u:User { id: $userId })-[lib:HAS_IN_LIBRARY]->(g:Game { igdbId: gid })
      OPTIONAL MATCH (u)-[fav:FAVORITED]->(g)
      OPTIONAL MATCH (author:User)-[:POSTED]->(rev:Review)-[:ABOUT]->(g)
      RETURN gid,
             lib.status AS status,
             lib.rating AS rating,
             fav IS NOT NULL AS isFavorited,
             collect(DISTINCT {
               id: rev.id,
               text: rev.text,
               author: author.username
             }) AS reviews
      `,
      { igdbIds, userId }
    );

    const interactionsMap = {};
    result.records.forEach(record => {
      const gid = record.get('gid');
      const rawReviews = record.get('reviews').filter(r => r.id !== null);
      interactionsMap[gid] = {
        status: record.get('status'),
        rating: record.get('rating') ? record.get('rating').toNumber() : null,
        isFavorited: record.get('isFavorited'),
        reviews: rawReviews
      };
    });

    res.render('catalog', { games, query, interactionsMap });
  } catch (error) {
    console.error('Erro ao carregar catálogo:', error);
    res.status(500).send('Erro ao buscar catálogo na IGDB.');
  } finally {
    await session.close();
  }
};

export const saveToLibrary = async (req, res) => {
  const userId = req.user.id;
  const { igdbId, name, coverUrl, status, rating, redirectQuery } = req.body;
  const session = getSession();

  try {
    await session.run(
      `
      MATCH (u:User { id: $userId })
      MERGE (g:Game { igdbId: $igdbId })
      ON CREATE SET g.name = $name, g.coverUrl = $coverUrl
      MERGE (u)-[r:HAS_IN_LIBRARY]->(g)
      SET r.status = $status,
          r.rating = CASE WHEN $rating <> '' THEN toInteger($rating) ELSE r.rating END,
          r.updatedAt = datetime()
      `,
      {
        userId,
        igdbId: String(igdbId),
        name,
        coverUrl,
        status: status || 'PLAYING',
        rating: rating || ''
      }
    );

    res.redirect(`/games/catalog?q=${encodeURIComponent(redirectQuery || '')}`);
  } catch (error) {
    console.error('Erro ao salvar na biblioteca:', error);
    res.status(500).send('Erro ao salvar jogo.');
  } finally {
    await session.close();
  }
};

export const toggleFavorite = async (req, res) => {
  const userId = req.user.id;
  const { igdbId, name, coverUrl, redirectQuery } = req.body;
  const session = getSession();

  try {
    await session.run(
      `
      MATCH (u:User { id: $userId })
      MERGE (g:Game { igdbId: $igdbId })
      ON CREATE SET g.name = $name, g.coverUrl = $coverUrl
      WITH u, g
      OPTIONAL MATCH (u)-[f:FAVORITED]->(g)
      FOREACH (_ IN CASE WHEN f IS NULL THEN [1] ELSE [] END |
        CREATE (u)-[:FAVORITED { createdAt: datetime() }]->(g)
      )
      FOREACH (_ IN CASE WHEN f IS NOT NULL THEN [1] ELSE [] END |
        DELETE f
      )
      `,
      { userId, igdbId: String(igdbId), name, coverUrl }
    );

    res.redirect(`/games/catalog?q=${encodeURIComponent(redirectQuery || '')}`);
  } catch (error) {
    console.error('Erro ao favoritar:', error);
    res.status(500).send('Erro ao favoritar jogo.');
  } finally {
    await session.close();
  }
};

export const addReview = async (req, res) => {
  const userId = req.user.id;
  const { igdbId, name, coverUrl, text, redirectQuery } = req.body;
  const session = getSession();

  try {
    if (!text || !text.trim()) {
      return res.redirect(`/games/catalog?q=${encodeURIComponent(redirectQuery || '')}`);
    }

    await session.run(
      `
      MATCH (u:User { id: $userId })
      MERGE (g:Game { igdbId: $igdbId })
      ON CREATE SET g.name = $name, g.coverUrl = $coverUrl
      CREATE (r:Review {
        id: $reviewId,
        text: $text,
        createdAt: datetime()
      })
      CREATE (u)-[:POSTED]->(r)-[:ABOUT]->(g)
      `,
      {
        userId,
        igdbId: String(igdbId),
        name,
        coverUrl,
        reviewId: uuidv4(),
        text: text.trim()
      }
    );

    res.redirect(`/games/catalog?q=${encodeURIComponent(redirectQuery || '')}`);
  } catch (error) {
    console.error('Erro ao comentar:', error);
    res.status(500).send('Erro ao publicar comentário.');
  } finally {
    await session.close();
  }
};