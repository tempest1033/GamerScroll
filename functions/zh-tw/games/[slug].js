import { handleGameRequest } from '../../_lib/game-route.js';

// /zh-tw/games/<slug>/ — see functions/_lib/game-route.js
export const onRequest = (context) => handleGameRequest(context, 'zh-tw');
