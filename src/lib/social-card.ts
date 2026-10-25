// Build-only artwork. Edit this composition to match your project.
export interface CardNode {
  type: 'div';
  key: null;
  props: {
    style: Readonly<Record<string, string | number>>;
    children: string | CardNode | readonly CardNode[];
  };
}

export function createCard(title: string): CardNode {
  return {
    type: 'div', key: null,
    props: {
      style: {
        display: 'flex', width: 1200, height: 630, padding: 80,
        backgroundColor: '#fafafa', color: '#111111',
        fontFamily: 'Noto Sans', fontWeight: 400, fontSize: 72,
        lineHeight: 1.12, alignItems: 'center', justifyContent: 'flex-start',
      },
      children: {
        type: 'div', key: null,
        props: {
          style: { display: 'block', width: '100%', lineClamp: 5, wordBreak: 'break-word', textOverflow: 'ellipsis', overflow: 'hidden' },
          children: title,
        },
      },
    },
  };
}
