import { getSession } from '../config/neo4j.js';

export const renderEditProfile = async (req, res) => {
  const userId = req.user.id;
  const session = getSession();

  try {
    const result = await session.run(
      `
      MATCH (u:User { id: $userId })
      RETURN u.username AS username,
             u.bio AS bio,
             u.avatarUrl AS avatarUrl,
             u.favoritePlatform AS favoritePlatform
      `,
      { userId }
    );

    const record = result.records[0];
    const userData = {
      username: record.get('username'),
      bio: record.get('bio') || '',
      avatarUrl: record.get('avatarUrl') || '',
      favoritePlatform: record.get('favoritePlatform') || ''
    };

    res.render('edit-profile', { userData, error: null });
  } catch (error) {
    console.error('Erro ao carregar edição de perfil:', error);
    res.status(500).send('Erro ao carregar dados do perfil.');
  } finally {
    await session.close();
  }
};

export const updateProfile = async (req, res) => {
  const userId = req.user.id;
  const { bio, avatarUrl, favoritePlatform } = req.body;
  const session = getSession();

  try {
    await session.run(
      `
      MATCH (u:User { id: $userId })
      SET u.bio = $bio,
          u.avatarUrl = $avatarUrl,
          u.favoritePlatform = $favoritePlatform,
          u.updatedAt = datetime()
      `,
      {
        userId,
        bio: bio ? bio.trim() : '',
        avatarUrl: avatarUrl ? avatarUrl.trim() : '',
        favoritePlatform: favoritePlatform || ''
      }
    );

    res.redirect('/profile');
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).render('edit-profile', {
      userData: { username: req.user.username, bio, avatarUrl, favoritePlatform },
      error: 'Erro ao salvar alterações.'
    });
  } finally {
    await session.close();
  }
};