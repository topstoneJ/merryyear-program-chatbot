export default function AnswerText({ text }: { text: string }) {
  const lines = text.trim().split("\n");
  return <p>{lines.map((line, index) => {
    const heading = line.trim().match(/^(?:◆\s*(.+)|\*\*(.+?)\*\*|#{1,3}\s+(.+))$/);
    return <span key={index}>{index > 0 ? "\n" : null}{heading ? <strong>{heading[1] || heading[2] || heading[3]}</strong> : line}</span>;
  })}</p>;
}
