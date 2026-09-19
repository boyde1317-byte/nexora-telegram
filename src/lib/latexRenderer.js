/**
 * latexRenderer.js — Java-free LaTeX → PNG renderer for the fork.
 *
 * The baileys fork's defaultRenderLatexToPng (mathjax-node with png:true)
 * shells out to a Java Batik process, which fails on hosts without a JVM
 * ("spawn java ENOENT") and falls back to codecogs URLs. This renderer
 * produces the PNG entirely in-process:
 *
 *   TeX --mathjax-node--> SVG --sharp--> PNG buffer
 *
 * Drop-in compatible with the renderLatexToPng contract expected by
 * generateLatexImageContent / generateLatexInlineImageContent /
 * generateLatexImageContentV2 (4th argument):
 *
 *   renderLatexToPng(latex, opts?) -> { buffer, width, height }
 *
 * opts: { scale = 2, fontColor = '#ffffff', backgroundColor = 'transparent' }
 */

let _mjInstance = null;

async function _getMathjax() {
  if (!_mjInstance) {
    const mod = await import('mathjax-node');
    const mj = mod.default || mod;
    mj.start();
    _mjInstance = mj;
  }
  return _mjInstance;
}

export async function renderLatexToPngSvg(latex, opts = {}) {
  const {
    scale = 2,
    fontColor = '#ffffff',
    backgroundColor = 'transparent',
  } = opts;

  if (!latex || typeof latex !== 'string') {
    throw new Error('renderLatexToPngSvg: no LaTeX expression provided');
  }

  const mj = await _getMathjax();

  // mathjax-node's promise form is unreliable for typeset; use the callback API.
  const svgResult = await new Promise((resolve, reject) => {
    try {
      mj.typeset(
        {
          math: latex,
          format: 'TeX',
          svg: true,
          font_color: fontColor,
          background: backgroundColor,
        },
        (result) => {
          if (result?.errors?.length) {
            reject(new Error('mathjax-node errors: ' + result.errors.join('; ')));
          } else if (!result?.svg) {
            reject(new Error('mathjax-node produced no SVG for: ' + latex));
          } else {
            resolve(result);
          }
        }
      );
    } catch (err) {
      reject(err);
    }
  });

  // mathjax-node SVG dimensions are in `ex` units. MathJax's default
  // font metrics make 1ex ≈ 16 CSS px; scale controls supersampling.
  const PX_PER_EX = 16;
  const wMatch = svgResult.svg.match(/width="([\d.]+)ex"/);
  const hMatch = svgResult.svg.match(/height="([\d.]+)ex"/);
  if (!wMatch || !hMatch) {
    throw new Error('renderLatexToPngSvg: could not read SVG dimensions (expected ex units)');
  }
  const wEx = parseFloat(wMatch[1]);
  const hEx = parseFloat(hMatch[1]);

  const width = Math.max(1, Math.ceil(wEx * PX_PER_EX * scale));
  const height = Math.max(1, Math.ceil(hEx * PX_PER_EX * scale));

  // Replace the ex-unit width/height with pixel values so sharp
  // rasterizes at exactly the size we computed.
  const fixedSvg = svgResult.svg
    .replace(/width="[\d.]+ex"/, `width="${width}"`)
    .replace(/height="[\d.]+ex"/, `height="${height}"`);

  const { default: sharp } = await import('sharp');
  const buffer = await sharp(Buffer.from(fixedSvg), {
    density: Math.round(72 * scale),
  })
    .png()
    .toBuffer();

  if (!buffer?.length || buffer[0] !== 0x89 || buffer[1] !== 0x50) {
    throw new Error('renderLatexToPngSvg: sharp did not produce a valid PNG buffer');
  }

  return { buffer, width, height };
}

export default renderLatexToPngSvg;
