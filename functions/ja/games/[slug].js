import { handleGameRequest } from '../../_lib/game-route.js';

// /ja/games/<slug>/ — see functions/_lib/game-route.js
export const onRequest = (context) => handleGameRequest(context, 'ja');
