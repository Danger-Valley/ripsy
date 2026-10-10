const address = value => typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
export function readyShopCatalog(catalog) {
  const figures = catalog?.figures;
  const fig2 = Array.isArray(figures) && figures.find(f => f?.id === 'fig2');
  const payment = fig2?.tokenPayment;
  let validImage = false;
  try { validImage = new URL(fig2?.imageUrl).protocol === 'https:'; } catch {}
  return catalog?.cluster === 'mainnet-beta' && address(catalog.collection) && address(catalog.treasury)
    && Array.isArray(figures) && figures.length === 1 && fig2?.available === true && fig2?.seekerExclusive === true
    && fig2?.priceLamports === '0' && validImage
    && payment?.mint === 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3'
    && payment.symbol === 'SKR' && payment.decimals === 6
    && typeof payment.amount === 'string' && /^[1-9]\d{0,15}$/.test(payment.amount);
}
if (process.argv.includes('--check')) {
  try { process.exitCode = readyShopCatalog(JSON.parse(process.env.SHOP_CATALOG_RESPONSE || '{}')) ? 0 : 1; }
  catch { process.exitCode = 1; }
}
