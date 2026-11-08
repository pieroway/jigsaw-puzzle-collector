import type { Puzzle } from '../data/puzzles';
export function PuzzleArt({ puzzle, className = '' }: { puzzle: Puzzle; className?: string }) {
  return <div className={`puzzle-art art-${puzzle.art} ${className}`} role="img" aria-label={`Illustrated artwork for ${puzzle.title}`}>
    <div className="art-sun"/><div className="art-hill back"/><div className="art-hill front"/>
    <div className="art-detail">{puzzle.art === 'birds' ? '✿' : puzzle.art === 'botanical' ? '❀' : puzzle.art === 'paris' ? '♜' : puzzle.art === 'kyoto' ? '⛩' : puzzle.art === 'coast' ? '≈' : '⌂'}</div>
    <div className="art-box-label"><span>{puzzle.manufacturer}</span><strong>{puzzle.title}</strong><small>{puzzle.pieces.toLocaleString()} PIECES</small></div>
  </div>;
}
