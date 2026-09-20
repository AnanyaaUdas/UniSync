// live activity feed. shows who did what, newest first.
// only the first 5 are shown, the rest open with "show more".
// bare = just the list, without the card around it
import React, { useEffect, useRef, useState } from 'react';
import { Avatar, RichText, Empty, useNow } from './ui';
import { useDB, userById, displayName, getSession } from '../../store/db';
import { timeAgo, firstName } from '../../lib/format';

const LIMIT = 5;

export default function ActivityFeed({ items, footer, bare = false }) {
  const [showAll, setShowAll] = useState(false);
  const now = useNow();
  const users = useDB((d) => d.users);
  const me = getSession();

  // remember which items we've already shown so new ones can flash
  const seen = useRef(new Set(items.map((i) => i.id)));
  useEffect(() => {
    items.forEach((i) => seen.current.add(i.id));
  }, [items]);

  const shown = showAll ? items : items.slice(0, LIMIT);

  const list = (
    <>
      <div className={`space-y-1 ${showAll && !bare ? 'max-h-[380px] overflow-y-auto pr-1' : ''}`}>
        {!items.length && <Empty>No activity yet</Empty>}
        {shown.map((item) => (
          <div key={item.id} className={`flex gap-3 p-2 rounded-xl ${seen.current.has(item.id) ? '' : 'flash'}`}>
            <Avatar id={item.who} size={30} showOnline />
            <div className="text-[13px] leading-snug min-w-0">
              <span className="font-semibold">{item.who === me ? 'You' : firstName(displayName(userById({ users }, item.who)))}</span>{' '}
              <RichText text={item.act} />
              <div className="text-[11px] mt-0.5 muted">{timeAgo(item.at, now)}</div>
            </div>
          </div>
        ))}
      </div>
      {items.length > LIMIT && (
        <button onClick={() => setShowAll(!showAll)} className="btn w-full mt-2 py-2 rounded-xl text-[12.5px] font-bold text-indigo-600 hover:bg-indigo-50">
          {showAll ? 'Show less' : `Show more (${items.length - LIMIT})`}
        </button>
      )}
    </>
  );

  if (bare) return list;

  return (
    <aside className="card p-5 h-fit">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-2 h-2 rounded-full bg-emerald-500 pulse" />
        <h2 className="font-bold">Live Activity Feed</h2>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold muted">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse" />LIVE
        </span>
      </div>
      {list}
      {footer}
    </aside>
  );
}
