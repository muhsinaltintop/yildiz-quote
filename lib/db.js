// lib/db.js
import mysql from 'mysql2/promise';

let pool;

export function getDb() {
  if (!pool) {
    if (!process.env.DB_HOST || !process.env.DB_USER) {
      throw new Error('DB_HOST veya DB_USER env tanımlı değil');
    }

    if (!process.env.DB_PASSWORD) {
      console.warn(
        'UYARI: DB_PASSWORD tanımlı DEĞİL, MySQL şifresiz bağlanmaya çalışacak!'
      );
    }

    pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || undefined,
      database: 'odycodig_yildiz_quote',
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return pool;
}
