import { getAiClient } from './aiClient.js';

export const aiAssetGenerator = {
  /**
   * Checks if Gemini AI image generation is fully configured and enabled
   */
  isEnabled() {
    const hasKey = !!process.env.GEMINI_API_KEY;
    const isEnabled = process.env.GENERATE_ASSETS === 'true' || process.env.GENERATE_ASSETS === true;
    return hasKey && isEnabled;
  },

  /**
   * Generates an image using Gemini AI based on the specified prompt
   * @param {string} prompt - Detailed description of the image to generate
   * @param {string} aspectRatio - "16:9", "1:1", "4:3", etc.
   * @returns {Promise<Buffer>} - Image Buffer
   */
  async generateImage(prompt, aspectRatio = '16:9') {
    try {
      const ai = getAiClient();
      console.log(`[AI ASSET GENERATOR] Initiating Gemini image generation with prompt: "${prompt}"...`);

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-image',
        contents: {
          parts: [
            {
              text: prompt
            }
          ]
        },
        config: {
          imageConfig: {
            aspectRatio
          }
        }
      });

      if (!response.candidates?.[0]?.content?.parts) {
        throw new Error('No candidates or content parts returned from Gemini API');
      }

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          console.log('[AI ASSET GENERATOR] Image successfully generated from Gemini.');
          return Buffer.from(part.inlineData.data, 'base64');
        }
      }

      throw new Error('Image data part was not found in the Gemini response');
    } catch (err) {
      console.error('[AI ASSET GENERATOR] Generation failed:', err.message || err);
      throw err;
    }
  }
};

export default aiAssetGenerator;
