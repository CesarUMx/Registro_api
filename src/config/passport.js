// src/config/passport.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('./db');

passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL:  process.env.GOOGLE_CALLBACK_URL
},
async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails[0].value;
    const displayName = profile.displayName || '';
    
    // Verifica si el usuario ya existe
    const res = await pool.query(
      `SELECT u.id, r.name AS role, u.name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.google_id = $1 OR u.email = $2`,
      [profile.id, email]
    );
    let user = res.rows[0];

    // Si no existe, puedes rechazar o crearlo (aquí rechazamos)
    if (!user) {
      return done(null, false, { message: 'Usuario no autorizado' });
    }

    // Si el usuario no tiene un nombre guardado, usar el de Google
    if (!user.name && displayName) {
      try {
        // Actualizar el nombre del usuario en la base de datos
        await pool.query(
          `UPDATE users SET name = $1 WHERE id = $2`,
          [displayName, user.id]
        );
        user.name = displayName;
      } catch (updateError) {
        console.error('Error al actualizar el nombre del usuario:', updateError);
      }
    }

    // Devolver objeto con id, rol y nombre
    return done(null, { 
      id: user.id, 
      role: user.role,
      name: user.name || displayName || ''
    });
  } catch (err) {
    done(err, false);
  }
}));

// No usamos session, así que serialize/deserialize pueden ser no-op
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

module.exports = passport;
