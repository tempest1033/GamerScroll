import { handleGameRequest } from '../../_lib/game-route.js';

// /ko/games/<slug>/ — see functions/_lib/game-route.js
export const onRequest = (context) => handleGameRequest(context, 'ko');
