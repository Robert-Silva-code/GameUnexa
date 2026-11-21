import { v4 as uuidv4 } from 'uuid';
import { searchGames, getGameById } from '../config/igdb.js';
import { getSession } from '../config/neo4j.js';

export const renderCatalog = async (req, res) => {
  const query = req.query.q || '';
  const limit = 20;
  const maxItems = 500;
  const maxPages = Math.ceil(maxItems / limit);

  let currentPage = parseInt(req.query.page, 10) || 1;
  if (currentPage < 1) currentPage = 1;
  if (currentPage > maxPages) currentPage = maxPages;

  const userId = req.user.id;
  const session = getSession();

  try {
    const games = await searchGames(query, currentPage, limit);
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

    const hasNextPage = games.length === limit && currentPage < maxPages;

    res.render('catalog', { 
      games, 
      query, 
      interactionsMap,
      currentPage,
      maxPages,
      hasNextPage
    });
  } catch (error) {
    console.error('Erro ao carregar catálogo:', error);
    res.status(500).send('Erro ao buscar catálogo na IGDB.');
  } finally {
    await session.close();
  }
};

export const renderGameDetails = async (req, res) => {
  const { igdbId } = req.params;
  const userId = req.user.id;
  const session = getSession();

  try {
    const game = await getGameById(igdbId);

    if (!game) {
      return res.status(404).send('Jogo não encontrado na IGDB.');
    }

    const result = await session.run(
      `
      OPTIONAL MATCH (g:Game { igdbId: $igdbId })
      OPTIONAL MATCH (me:User { id: $userId })-[myLib:HAS_IN_LIBRARY]->(g)
      OPTIONAL MATCH (me)-[myFav:FAVORITED]->(g)
      OPTIONAL MATCH (allUsers:User)-[allLib:HAS_IN_LIBRARY]->(g)
      WITH g, myLib, myFav,
           count(DISTINCT allUsers) AS playersCount,
           avg(allLib.rating) AS avgRating

      CALL {
        WITH g
        OPTIONAL MATCH (author:User)-[:POSTED]->(rev:Review)-[:ABOUT]->(g)
        OPTIONAL MATCH (liker:User)-[:LIKED]->(rev)
        OPTIONAL MATCH (meUser:User { id: $userId })-[myLike:LIKED]->(rev)
        OPTIONAL MATCH (cAuthor:User)-[:COMMENTED]->(c:Comment)-[:ON]->(rev)
        WITH rev, author,
             count(DISTINCT liker) AS likesCount,
             myLike IS NOT NULL AS isLiked,
             c, cAuthor
        ORDER BY c.createdAt ASC
        WITH rev, author, likesCount, isLiked,
             collect(DISTINCT { id: c.id, author: cAuthor.username, text: c.text }) AS comments
        RETURN collect(DISTINCT {
          id: rev.id,
          text: rev.text,
          author: author.username,
          createdAt: toString(rev.createdAt),
          likesCount: likesCount,
          isLiked: isLiked,
          comments: comments
        }) AS reviews
      }

      RETURN myLib.status AS myStatus,
             myLib.rating AS myRating,
             myFav IS NOT NULL AS isFavorited,
             playersCount,
             avgRating,
             reviews
      `,
      { igdbId: String(igdbId), userId }
    );

    const record = result.records[0];
    const rawReviews = (record.get('reviews') || [])
      .filter(r => r.id !== null)
      .map(r => ({
        ...r,
        likesCount: typeof r.likesCount === 'number' ? r.likesCount : r.likesCount.toNumber(),
        comments: (r.comments || []).filter(c => c.id !== null)
      }))
      .sort((a, b) => {
        if (b.likesCount !== a.likesCount) {
          return b.likesCount - a.likesCount;
        }
        return new Date(b.createdAt) - new Date(a.createdAt);
      });

    const socialData = {
      myStatus: record.get('myStatus'),
      myRating: record.get('myRating') ? record.get('myRating').toNumber() : null,
      isFavorited: record.get('isFavorited'),
      playersCount: record.get('playersCount').toNumber(),
      avgRating: record.get('avgRating') ? Number(record.get('avgRating')).toFixed(1) : null,
      reviews: rawReviews
    };

    res.render('game-details', { game, socialData });
  } catch (error) {
    console.error('Erro ao carregar detalhes do jogo:', error);
    res.status(500).send('Erro ao carregar detalhes do jogo.');
  } finally {
    await session.close();
  }
};

const getRedirectUrl = (body) => {
  if (body.redirectTo) return body.redirectTo;
  return `/games/catalog?q=${encodeURIComponent(body.redirectQuery || '')}`;
};

export const saveToLibrary = async (req, res) => {
  const userId = req.user.id;
  const { igdbId, name, coverUrl, status, rating, redirectQuery, redirectPage } = req.body;
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

    const pageParam = redirectPage ? `&page=${redirectPage}` : '';
    res.redirect(`/games/catalog?q=${encodeURIComponent(redirectQuery || '')}${pageParam}`);
  } catch (error) {
    console.error('Erro ao salvar na biblioteca:', error);
    res.status(500).send('Erro ao salvar jogo.');
  } finally {
    await session.close();
  }
};

export const toggleFavorite = async (req, res) => {
  const userId = req.user.id;
  const { igdbId, name, coverUrl, redirectQuery, redirectPage } = req.body;
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

    const pageParam = redirectPage ? `&page=${redirectPage}` : '';
    res.redirect(`/games/catalog?q=${encodeURIComponent(redirectQuery || '')}${pageParam}`);
  } catch (error) {
    console.error('Erro ao favoritar:', error);
    res.status(500).send('Erro ao favoritar jogo.');
  } finally {
    await session.close();
  }
};

export const addReview = async (req, res) => {
  const userId = req.user.id;
  const { igdbId, name, coverUrl, text, redirectQuery, redirectPage } = req.body;
  const session = getSession();
  const pageParam = redirectPage ? `&page=${redirectPage}` : '';

  try {
    if (!text || !text.trim()) {
      return res.redirect(`/games/catalog?q=${encodeURIComponent(redirectQuery || '')}${pageParam}`);
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

    res.redirect(`/games/catalog?q=${encodeURIComponent(redirectQuery || '')}${pageParam}`);
  } catch (error) {
    console.error('Erro ao comentar:', error);
    res.status(500).send('Erro ao publicar comentário.');
  } finally {
    await session.close();
  }
};

export const searchGamesJson = async (req, res) => {
  const query = req.query.q || '';
  if (query.trim().length < 2) {
    return res.json([]);
  }

  try {
    const games = await searchGames(query);
    res.json(games.slice(0, 6));
  } catch (error) {
    console.error('Erro na busca rápida IGDB:', error);
    res.status(500).json([]);
  }
};