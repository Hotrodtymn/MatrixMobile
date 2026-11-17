package expo.modules.heymatrix

import android.content.res.AssetManager
import com.k2fsa.sherpa.onnx.*

// Explicit values match the bundled GigaSpeech zipformer2 model and keywords file.
object WakeModel {
  const val SAMPLE_RATE = 16000
  const val EXPECTED_KEYWORD = "HEY_MATRIX"
  const val KEYWORD_LINE = "▁HE Y ▁MA T RI X :1.5 #0.35 @HEY_MATRIX"
  private const val PREFIX = "hey-matrix/"
  val files = listOf("encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
    "decoder-epoch-12-avg-2-chunk-16-left-64.onnx",
    "joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx", "tokens.txt", "keywords.txt")
  fun verifyAssets(assets: AssetManager) {
    for (file in files) assets.open(PREFIX + file).use { check(it.read() >= 0) { "Missing or empty wake model asset: $file" } }
    val keyword = assets.open(PREFIX + "keywords.txt").bufferedReader(Charsets.UTF_8).use { it.readText().trim() }
    check(keyword == KEYWORD_LINE) { "Wake keyword configuration does not match this build." }
    val vocab = assets.open(PREFIX + "tokens.txt").bufferedReader(Charsets.UTF_8).use { reader ->
      reader.readLines().map { it.substringBeforeLast(' ') }.toSet()
    }
    check(keyword.substringBefore(" :").split(' ').all { it in vocab }) { "Wake keyword tokens are absent from the model vocabulary." }
  }
  fun config() = KeywordSpotterConfig(
    featConfig = FeatureConfig(sampleRate = SAMPLE_RATE, featureDim = 80),
    modelConfig = OnlineModelConfig(transducer = OnlineTransducerModelConfig(
      encoder = PREFIX + files[0], decoder = PREFIX + files[1], joiner = PREFIX + files[2]),
      tokens = PREFIX + "tokens.txt", modelType = "zipformer2", numThreads = 1, debug = false, provider = "cpu"),
    keywordsFile = PREFIX + "keywords.txt", maxActivePaths = 4, numTrailingBlanks = 2,
    keywordsScore = 1.5f, keywordsThreshold = 0.25f)
  // keywords.txt overrides the default threshold for this phrase to 0.35, boost 1.5.
}
