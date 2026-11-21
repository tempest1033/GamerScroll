import { handleGameRequest } from '../../_lib/game-route.js';

// /zh-cn/games/<slug>/ — see functions/_lib/game-route.js
export const onRequest = (context) => handleGameRequest(context, 'zh-cn');
