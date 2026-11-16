import axios from 'axios';
import 'dotenv/config';

let cachedToken = null;
let tokenExpiration = 0;

const getIgdbToken = async () => {
  const now = Date.now();
  if (cachedToken && now < tokenExpiration) {
    return cachedToken;
  }

  const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
    params: {
      client_id: process.env.TWITCH_CLIENT_ID,
      client_secret: process.env.TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials'
    }
  });

  cachedToken = response.data.access_token;
  tokenExpiration = now + (response.data.expires_in - 300) * 1000;
  return cachedToken;
};

export const searchGames = async (query = '', page = 1, limit = 20) => {
  const token = await getIgdbToken();
  const offset = (page - 1) * limit;

  let apicalypseQuery = `
    fields id, name, cover.url, first_release_date, summary, rating;
    limit ${limit};
    offset ${offset};
  `;

  if (query.trim()) {
    apicalypseQuery += `
      where cover != null & version_parent = null;
      search "${query.replace(/"/g, '')}";
    `;
  } else {
    apicalypseQuery += `
      where cover != null & version_parent = null & total_rating_count > 50;
      sort total_rating_count desc;
    `;
  }

  const response = await axios.post('https://api.igdb.com/v4/games', apicalypseQuery, {
    headers: {
      'Client-ID': process.env.TWITCH_CLIENT_ID,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/plain'
    }
  });

  return response.data.map(game => ({
    igdbId: String(game.id),
    name: game.name,
    coverUrl: game.cover?.url
      ? `https:${game.cover.url.replace('t_thumb', 't_cover_big')}`
      : 'https://via.placeholder.com/264x352?text=Sem+Capa',
    releaseYear: game.first_release_date
      ? new Date(game.first_release_date * 1000).getFullYear()
      : 'N/A',
    summary: game.summary || 'Sem descrição disponível.'
  }));
};