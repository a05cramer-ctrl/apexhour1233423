APEX site

Vercel env var: HELIUS_API_KEY
config.js: CA = $APEX mint, CREATOR = the launch wallet (the engine's wallet), X after launch.
QUOTE is STONK; change it (and the engine's QUOTE_MINT) if you launch against another pair.
MIN_VOLUME 0 = 0.05 SOL worth of the quote, same as the engine default.
The api/ folder must stay a folder named api (Vercel functions). _lib.js is shared with the engine.
