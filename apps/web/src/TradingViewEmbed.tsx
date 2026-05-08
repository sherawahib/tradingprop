interface TradingViewEmbedProps {
  symbol: string;
}

function TradingViewEmbed({ symbol }: TradingViewEmbedProps) {
  const tvSymbol = encodeURIComponent(symbol);
  const url =
    `https://s.tradingview.com/widgetembed/?symbol=${tvSymbol}` +
    `&interval=15&theme=dark&style=1&timezone=Etc/UTC&withdateranges=1` +
    `&hideideas=1&saveimage=1&toolbarbg=111b31&hide_top_toolbar=0&allow_symbol_change=1`;

  return (
    <iframe
      title="TradingView Chart"
      src={url}
      className="tvIframe"
      allowTransparency
      frameBorder={0}
    />
  );
}

export default TradingViewEmbed;
