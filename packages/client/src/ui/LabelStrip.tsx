/**
 * The certification label.
 *
 * Every panel in the game is headed by the same strip that appears on a graded
 * slab: a condensed uppercase title, a seal-coloured rule, and a monospace
 * serial. The gilt seal is reserved for grade 9 and 10 so the colour keeps its
 * meaning wherever it appears.
 */
export function LabelStrip({
  title,
  serial,
  seal = 'verdigris',
}: {
  title: string;
  serial?: string;
  seal?: 'verdigris' | 'gilt';
}) {
  return (
    <div className="label-strip" data-seal={seal}>
      <h2 className="label-strip__title">{title}</h2>
      {serial ? <span className="label-strip__serial">{serial}</span> : null}
    </div>
  );
}
