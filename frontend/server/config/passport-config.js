// server/config/passport-config.js

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as OAuth2Strategy } from 'passport-oauth2';
import { findUserByGoogleId, findUserByRiotId, createUser } from '../models/database.js';
import dotenv from 'dotenv';

dotenv.config();

// Serialize user ID into session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    // Simple deserialization: fetch user info if needed later
    // For now we just pass the id
    done(null, { id });
});

// Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Find or create user by Google ID
        let userId = await findUserByGoogleId(profile.id);
        if (!userId) {
            // Create a user with placeholder password (not used for OAuth)
            userId = await createUser(profile.displayName || 'google_user', 'oauth_placeholder', profile.id, null);
        }
        return done(null, { id: userId });
    } catch (err) {
        return done(err, null);
    }
}));

// Riot OAuth Strategy (generic OAuth2)
passport.use('riot', new OAuth2Strategy({
    authorizationURL: process.env.RIOT_AUTHORIZATION_URL || 'https://auth.riotgames.com/authorize',
    tokenURL: process.env.RIOT_TOKEN_URL || 'https://auth.riotgames.com/token',
    clientID: process.env.RIOT_CLIENT_ID,
    clientSecret: process.env.RIOT_CLIENT_SECRET,
    callbackURL: process.env.RIOT_CALLBACK_URL || '/api/auth/riot/callback'
}, async (accessToken, refreshToken, profile, done) => {
    // Riot does not provide a standard profile; we can fetch user info if needed.
    // For simplicity, we treat the accessToken as identifier.
    try {
        const riotId = accessToken; // placeholder identifier
        let userId = await findUserByRiotId(riotId);
        if (!userId) {
            userId = await createUser('riot_user', 'oauth_placeholder', null, riotId);
        }
        return done(null, { id: userId });
    } catch (err) {
        return done(err, null);
    }
}));

export default passport;
