const fs = require('fs');
const path = require('path');

const templatePath = path.join(__dirname, 'match-result-card.html');
let cachedTemplate = null;

function getTemplate() {
  if (!cachedTemplate) {
    cachedTemplate = fs.readFileSync(templatePath, 'utf8');
  }
  return cachedTemplate;
}

function renderMatchCard({
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  competition,
  matchDate,
}) {
  return getTemplate()
    .replace(/const HOME_TEAM = .*?;/, `const HOME_TEAM = ${JSON.stringify(homeTeam)};`)
    .replace(/const AWAY_TEAM = .*?;/, `const AWAY_TEAM = ${JSON.stringify(awayTeam)};`)
    .replace(/const HOME_SCORE = .*?;/, `const HOME_SCORE = ${Number(homeScore)};`)
    .replace(/const AWAY_SCORE = .*?;/, `const AWAY_SCORE = ${Number(awayScore)};`)
    .replace(/const COMPETITION = .*?;/, `const COMPETITION = ${JSON.stringify(competition)};`)
    .replace(/const MATCH_DATE = .*?;/, `const MATCH_DATE = ${JSON.stringify(matchDate)};`);
}

module.exports = { renderMatchCard };
