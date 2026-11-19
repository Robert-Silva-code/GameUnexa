import { v4 as uuidv4 } from 'uuid';
import { getSession } from '../config/neo4j.js';

export const renderInbox = async (req, res) => {
  const userId = req.user.id;
  const session = getSession();

  try {
    const result = await session.run(
      `
      MATCH (me:User { id: $userId })
      MATCH (me)-[:SENT|TO]-(m:Message)-[:SENT|TO]-(other:User)
      WHERE other.id <> me.id
      WITH other, m
      ORDER BY m.createdAt DESC
      WITH other, collect(m)[0] AS lastMsg
      RETURN other.id AS partnerId,
             other.username AS partnerUsername,
             other.avatarUrl AS partnerAvatar,
             lastMsg.text AS lastText,
             toString(lastMsg.createdAt) AS lastDate
      ORDER BY lastDate DESC
      `,
      { userId }
    );

    const conversations = result.records.map(r => ({
      partnerId: r.get('partnerId'),
      partnerUsername: r.get('partnerUsername'),
      partnerAvatar: r.get('partnerAvatar') || '',
      lastText: r.get('lastText'),
      lastDate: r.get('lastDate')
    }));

    res.render('inbox', { conversations });
  } catch (error) {
    console.error('Erro ao carregar caixa de entrada:', error);
    res.status(500).send('Erro ao carregar mensagens.');
  } finally {
    await session.close();
  }
};

export const renderChat = async (req, res) => {
  const userId = req.user.id;
  const { username } = req.params;
  const session = getSession();

  try {
    const partnerResult = await session.run(
      `
      MATCH (other:User { username: $username })
      RETURN other.id AS id, other.username AS username, other.avatarUrl AS avatarUrl
      `,
      { username }
    );

    if (partnerResult.records.length === 0) {
      return res.status(404).send('Jogador não encontrado.');
    }

    const partnerRecord = partnerResult.records[0];
    const partner = {
      id: partnerRecord.get('id'),
      username: partnerRecord.get('username'),
      avatarUrl: partnerRecord.get('avatarUrl') || ''
    };

    if (partner.id === userId) {
      return res.redirect('/messages');
    }

    const msgsResult = await session.run(
      `
      MATCH (me:User { id: $userId }), (other:User { id: $partnerId })
      MATCH (sender:User)-[:SENT]->(m:Message)-[:TO]->(receiver:User)
      WHERE (sender = me AND receiver = other)
         OR (sender = other AND receiver = me)
      RETURN m.id AS id,
             m.text AS text,
             toString(m.createdAt) AS createdAt,
             sender.id = me.id AS isMine,
             sender.username AS senderUsername
      ORDER BY m.createdAt ASC
      `,
      { userId, partnerId: partner.id }
    );

    const messages = msgsResult.records.map(r => ({
      id: r.get('id'),
      text: r.get('text'),
      createdAt: r.get('createdAt'),
      isMine: r.get('isMine'),
      senderUsername: r.get('senderUsername')
    }));

    res.render('chat', { partner, messages });
  } catch (error) {
    console.error('Erro ao carregar conversa:', error);
    res.status(500).send('Erro ao abrir conversa.');
  } finally {
    await session.close();
  }
};

export const sendMessage = async (req, res) => {
  const userId = req.user.id;
  const { username } = req.params;
  const { text } = req.body;
  const session = getSession();

  try {
    if (!text || !text.trim()) {
      return res.redirect(`/messages/${encodeURIComponent(username)}`);
    }

    await session.run(
      `
      MATCH (me:User { id: $userId }), (other:User { username: $username })
      WHERE me.id <> other.id
      CREATE (m:Message {
        id: $msgId,
        text: $text,
        createdAt: datetime()
      })
      CREATE (me)-[:SENT]->(m)-[:TO]->(other)
      `,
      {
        userId,
        username,
        msgId: uuidv4(),
        text: text.trim()
      }
    );

    res.redirect(`/messages/${encodeURIComponent(username)}`);
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    res.status(500).send('Erro ao enviar mensagem.');
  } finally {
    await session.close();
  }
};