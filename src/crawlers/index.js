const { fetchYouTubeVideos, YOUTUBE_CATEGORIES } = require('./youtube');
const { fetchChzzkLives, fetchSoopLives } = require('./live');
const { fetchCommunityPosts } = require('./community');
const { fetchNews, extractGameTag } = require('./news');
const { fetchSteamDetails, fetchSteamRankings } = require('./steam');
const { fetchUpcomingGames, fetchSteamUpcoming, fetchNintendoUpcoming, fetchPS5Upcoming, fetchMobileUpcoming } = require('./upcoming');
const { fetchRankings, countries } = require('./rankings');
const { fetchMetacriticGames } = require('./metacritic');
const { fetchGameStockList, fetchStockPrices, fetchStockPrice, getStockCode } = require('./stocks');

module.exports = {
  // YouTube
  fetchYouTubeVideos,
  YOUTUBE_CATEGORIES,

  // Live Streaming
  fetchChzzkLives,
  fetchSoopLives,

  // Community
  fetchCommunityPosts,

  // News
  fetchNews,
  extractGameTag,

  // Steam
  fetchSteamDetails,
  fetchSteamRankings,

  // Upcoming
  fetchUpcomingGames,
  fetchSteamUpcoming,
  fetchNintendoUpcoming,
  fetchPS5Upcoming,
  fetchMobileUpcoming,

  // Rankings
  fetchRankings,
  countries,

  // Metacritic
  fetchMetacriticGames,

  // Stocks (게임주)
  fetchGameStockList,
  fetchStockPrices,
  fetchStockPrice,
  getStockCode
};
