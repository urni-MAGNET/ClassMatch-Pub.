// A small, bounded expression language. No JavaScript source is executed.
export const FORMULA_ALIASES = {
  勝利数: 'wins', トーナメント勝利数: 'tournamentWins',
  三位決定戦を除いた勝利数: 'winsWithoutThirdPlace', 三位決定戦を除いたトーナメント勝利数: 'tournamentWinsWithoutThirdPlace',
  三位決定戦の勝利数: 'thirdPlaceWins', 総得点: 'goalsFor', 総失点: 'goalsAgainst', 得失点差: 'goalDifference',
  順位: 'rank', 競技内順位: 'placement', 参加チーム数: 'teamCount', 勝利数順位: 'winRank',
  参加: 'participation', 決勝トーナメント進出チーム: 'finalTournamentParticipant', ベスト4: 'top4', ベスト8のみ: 'best8Only', ベスト8: 'best8', 順位点: 'rankScore', ベスト8順位点: 'best8RankScore'
};
const variables = new Set(Object.values(FORMULA_ALIASES));
const aliases = { ...FORMULA_ALIASES, もし: 'if', 最大: 'max', 最小: 'min', 四捨五入: 'round', 切り捨て: 'floor', 切り上げ: 'ceil', かつ: '&&', または: '||', ではない: '!' };
const functions = { if: [3, 3], min: [1, 64], max: [1, 64], round: [1, 1], floor: [1, 1], ceil: [1, 1] };
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const precedence = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };

export function parseScoreFormula(source) {
  const text = String(source ?? '').normalize('NFKC').trim();
  if (!text) throw new Error('得点計算式が空です。');
  if (text.length > 1000) throw new Error('計算式は1000文字以内にしてください。');
  const tokens = [];
  const pattern = /\s*(>=|<=|==|!=|&&|\|\||[()+\-*/%,<>!]|(?:\d+(?:\.\d*)?|\.\d+)|[\p{L}_][\p{L}\p{N}_]*)/uy;
  let offset = 0;
  while (offset < text.length) {
    pattern.lastIndex = offset;
    const match = pattern.exec(text);
    if (!match) throw new Error(`${offset + 1}文字目付近に使用できない記号があります。`);
    const token = match[1];
    const canonical = own(aliases, token) ? aliases[token] : [...variables, ...Object.keys(functions)].find(key => key.toLowerCase() === token.toLowerCase()) ?? token;
    tokens.push(canonical); offset = pattern.lastIndex;
  }
  let position = 0;
  const peek = () => tokens[position];
  const expect = token => { if (tokens[position++] !== token) throw new Error(`「${token}」が必要です。`); };
  function expression(minimum = 1, depth = 0) {
    if (depth > 64) throw new Error('括弧や演算の入れ子が深すぎます。');
    const token = tokens[position++];
    let left;
    if (['+', '-', '!'].includes(token)) left = { unary: token, value: expression(7, depth + 1) };
    else if (token === '(') { left = expression(1, depth + 1); expect(')'); }
    else if (/^(?:\d|\.\d)/.test(token ?? '')) left = { number: Number(token) };
    else if (own(functions, token)) {
      expect('(');
      const args = [];
      if (peek() !== ')') {
        do { args.push(expression(1, depth + 1)); if (peek() !== ',') break; position++; } while (true);
      }
      expect(')');
      const [min, max] = functions[token];
      if (args.length < min || args.length > max) throw new Error(`関数「${token}」の引数は${min === max ? min : `${min}〜${max}`}個必要です。`);
      left = { call: token, args };
    } else if (variables.has(token)) left = { variable: token };
    else throw new Error(token ? `未定義の変数・関数「${token}」です。` : '数値・変数・式が必要です。');
    while (own(precedence, peek()) && precedence[peek()] >= minimum) {
      const operator = tokens[position++];
      left = { operator, left, right: expression(precedence[operator] + 1, depth + 1) };
    }
    return left;
  }
  const tree = expression();
  if (position !== tokens.length) throw new Error(`「${peek()}」の前後の演算子や括弧を確認してください。`);
  return tree;
}

export function evaluateScoreFormula(source, values = {}) {
  const tree = parseScoreFormula(source);
  function evaluate(node) {
    let result;
    if (own(node, 'number')) result = node.number;
    else if (node.variable) {
      const key = own(values, node.variable) ? node.variable : node.variable.toLowerCase();
      if (!own(values, key)) throw new Error(`変数「${node.variable}」の値がありません。`);
      result = Number(values[key]);
    } else if (node.unary) {
      const value = evaluate(node.value);
      result = node.unary === '-' ? -value : node.unary === '!' ? Number(!value) : value;
    } else if (node.call) {
      if (node.call === 'if') return evaluate(node.args[evaluate(node.args[0]) ? 1 : 2]);
      const args = node.args.map(evaluate);
      result = Math[node.call](...args);
    } else {
      const left = evaluate(node.left);
      if (node.operator === '&&') return left ? Number(Boolean(evaluate(node.right))) : 0;
      if (node.operator === '||') return left ? 1 : Number(Boolean(evaluate(node.right)));
      const right = evaluate(node.right);
      if (['/', '%'].includes(node.operator) && right === 0) throw new Error('ゼロで割ることはできません。条件分岐で分母を確認してください。');
      switch (node.operator) {
        case '+': result = left + right; break; case '-': result = left - right; break;
        case '*': result = left * right; break; case '/': result = left / right; break; case '%': result = left % right; break;
        case '<': result = Number(left < right); break; case '>': result = Number(left > right); break;
        case '<=': result = Number(left <= right); break; case '>=': result = Number(left >= right); break;
        case '==': result = Number(left === right); break; case '!=': result = Number(left !== right); break;
      }
    }
    if (!Number.isFinite(result)) throw new Error('計算結果または変数の値が有効な数値ではありません。');
    return result;
  }
  return evaluate(tree);
}
