import { handleGameRequest } from '../_lib/game-route.js';

// /games/<slug>/ — see functions/_lib/game-route.js
export const onRequest = (context) => handleGameRequest(context, 'en');
