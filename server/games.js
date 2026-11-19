// 사이트에서 제공하는 게임 목록. 방 관리 코드는 이 어댑터만 통해 각 게임 규칙을 호출한다.
import * as life from '../game/engine.js';
import { normalizeSettings as lifeNormalize, defaultSettings as lifeDefaults } from '../game/settings.js';
import * as harbor from '../game/harbor/engine.js';
import { normalizeHarborSettings, defaultHarborSettings, PLAYER_LIMITS } from '../game/harbor/data.js';

export const GAMES = {
  life: {
    id: 'life', name: '갈림길 인생', min: 2, max: 12, defaultCap: 8,
    engine: life, normalizeSettings: lifeNormalize, defaultSettings: lifeDefaults, hasBoard: true,
    publicGame(g) { const { rng, seed, board, ...rest } = g; return rest; },
  },
  harbor: {
    id: 'harbor', name: '항구의 길', min: PLAYER_LIMITS.min, max: PLAYER_LIMITS.max, defaultCap: PLAYER_LIMITS.default,
    engine: harbor, normalizeSettings: normalizeHarborSettings, defaultSettings: defaultHarborSettings, hasBoard: false,
    publicGame(g) { const { rng, seed, ...rest } = g; return rest; },
  },
};

// 게임 종류 필드가 없는 기존 저장 데이터는 「갈림길 인생」
export const gameTypeOf = (room) => (room && GAMES[room.gameType] ? room.gameType : 'life');
export const gameOf = (room) => GAMES[gameTypeOf(room)];
export const isGameType = (t) => Object.hasOwn(GAMES, t);
