import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getSession } from '../config/neo4j.js';

// Helper para gerar o token e configurar o cookie
const setAuthCookie = (res, user) => {
  const token = jwt.sign(
    { id: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dias em milissegundos
  });
};

// Renderizar telas
export const renderRegister = (req, res) => {
  res.render('register', { error: null, title: "GameUnexa" });
};

export const renderLogin = (req, res) => {
  res.render('login', { error: null, title: "GameUnexa" });
};

export const register = async (req, res) => {
  const { username, email, password } = req.body;
  const session = getSession();

  try {
    if (!username || !email || !password) {
      return res.status(400).render('register', { error: 'Preencha todos os campos.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    const result = await session.run(
      `
      CREATE (u:User {
        id: $id,
        username: $username,
        email: $email,
        passwordHash: $passwordHash,
        createdAt: datetime()
      })
      RETURN u
      `,
      {
        id: userId,
        username: username.trim(),
        email: email.trim().toLowerCase(),
        passwordHash: hashedPassword
      }
    );

    const createdUser = result.records[0].get('u').properties;
    setAuthCookie(res, createdUser);

    return res.redirect('/profile');
  } catch (error) {
    if (error.code === 'Neo.ClientError.Schema.ConstraintValidationFailed') {
      return res.status(400).render('register', {
        error: 'Este e-mail ou nome de usuário já está em uso.'
      });
    }
    console.error('Erro no cadastro:', error);
    return res.status(500).render('register', { error: 'Erro interno ao criar conta.' });
  } finally {
    await session.close();
  }
};

// Processar Login
export const login = async (req, res) => {
  const { email, password } = req.body;
  const session = getSession();

  try {
    const result = await session.run(
      `
      MATCH (u:User { email: $email })
      RETURN u
      `,
      { email: email.trim().toLowerCase() }
    );

    if (result.records.length === 0) {
      return res.status(401).render('login', { error: 'E-mail ou senha inválidos.' });
    }

    const user = result.records[0].get('u').properties;
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).render('login', { error: 'E-mail ou senha inválidos.' });
    }

    setAuthCookie(res, user);
    return res.redirect('/profile');
  } catch (error) {
    console.error('Erro no login:', error);
    return res.status(500).render('login', { error: 'Erro interno ao realizar login.' });
  } finally {
    await session.close();
  }
};

// Processar Logout
export const logout = (req, res) => {
  res.clearCookie('token');
  res.redirect('/auth/login');
};