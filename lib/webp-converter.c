#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <strings.h>
#include <png.h>
#include <jpeglib.h>
#include <webp/encode.h>

static void fail(const char *message) {
  fprintf(stderr, "%s\n", message);
  exit(1);
}

static void *xmalloc(size_t size) {
  void *ptr = malloc(size);
  if (!ptr) {
    fail("memory allocation failed");
  }
  return ptr;
}

static void load_png(const char *input_path, uint8_t **pixels, int *width, int *height, int *channels) {
  png_image image;
  memset(&image, 0, sizeof(image));
  image.version = PNG_IMAGE_VERSION;

  if (!png_image_begin_read_from_file(&image, input_path)) {
    fail("failed to read png file");
  }

  image.format = PNG_FORMAT_RGBA;
  size_t size = PNG_IMAGE_SIZE(image);
  uint8_t *buffer = xmalloc(size);

  if (!png_image_finish_read(&image, NULL, buffer, 0, NULL)) {
    free(buffer);
    png_image_free(&image);
    fail("failed to decode png file");
  }

  *pixels = buffer;
  *width = (int) image.width;
  *height = (int) image.height;
  *channels = 4;
  png_image_free(&image);
}

static void load_jpeg(const char *input_path, uint8_t **pixels, int *width, int *height, int *channels) {
  FILE *input = fopen(input_path, "rb");
  if (!input) {
    fail("failed to open jpeg file");
  }

  struct jpeg_decompress_struct cinfo;
  struct jpeg_error_mgr jerr;
  cinfo.err = jpeg_std_error(&jerr);
  jpeg_create_decompress(&cinfo);
  jpeg_stdio_src(&cinfo, input);
  jpeg_read_header(&cinfo, TRUE);
  jpeg_start_decompress(&cinfo);

  *width = (int) cinfo.output_width;
  *height = (int) cinfo.output_height;
  *channels = 3;
  size_t row_stride = (size_t) (*width) * cinfo.output_components;
  size_t buffer_size = (size_t) (*width) * (*height) * 3;
  uint8_t *buffer = xmalloc(buffer_size);
  JSAMPARRAY row = (*cinfo.mem->alloc_sarray)((j_common_ptr) &cinfo, JPOOL_IMAGE, (JDIMENSION) row_stride, 1);
  uint8_t *cursor = buffer;

  while (cinfo.output_scanline < cinfo.output_height) {
    jpeg_read_scanlines(&cinfo, row, 1);
    if (cinfo.output_components == 3) {
      memcpy(cursor, row[0], (size_t) (*width) * 3);
    } else {
      for (int x = 0; x < *width; x += 1) {
        uint8_t gray = row[0][x];
        cursor[(size_t) x * 3] = gray;
        cursor[(size_t) x * 3 + 1] = gray;
        cursor[(size_t) x * 3 + 2] = gray;
      }
    }
    cursor += (size_t) (*width) * 3;
  }

  jpeg_finish_decompress(&cinfo);
  jpeg_destroy_decompress(&cinfo);
  fclose(input);
  *pixels = buffer;
}

static void write_webp(const char *output_path, const uint8_t *pixels, int width, int height, int channels) {
  uint8_t *webp_data = NULL;
  size_t webp_size = 0;
  float quality = channels == 4 ? 80.0f : 82.0f;

  if (channels == 4) {
    webp_size = WebPEncodeRGBA(pixels, width, height, width * 4, quality, &webp_data);
  } else {
    webp_size = WebPEncodeRGB(pixels, width, height, width * 3, quality, &webp_data);
  }

  if (webp_size == 0 || webp_data == NULL) {
    fail("failed to encode webp file");
  }

  FILE *output = fopen(output_path, "wb");
  if (!output) {
    WebPFree(webp_data);
    fail("failed to open webp output file");
  }

  if (fwrite(webp_data, 1, webp_size, output) != webp_size) {
    fclose(output);
    WebPFree(webp_data);
    fail("failed to write webp output file");
  }

  fclose(output);
  WebPFree(webp_data);
}

int main(int argc, char **argv) {
  if (argc != 3) {
    fprintf(stderr, "usage: %s <input> <output>\n", argv[0]);
    return 1;
  }

  const char *input_path = argv[1];
  const char *output_path = argv[2];
  const char *extension = strrchr(input_path, '.');
  if (!extension) {
    fail("missing input extension");
  }

  uint8_t *pixels = NULL;
  int width = 0;
  int height = 0;
  int channels = 0;

  if (strcasecmp(extension, ".png") == 0) {
    load_png(input_path, &pixels, &width, &height, &channels);
  } else if (strcasecmp(extension, ".jpg") == 0 || strcasecmp(extension, ".jpeg") == 0) {
    load_jpeg(input_path, &pixels, &width, &height, &channels);
  } else {
    fail("unsupported input format");
  }

  write_webp(output_path, pixels, width, height, channels);
  free(pixels);
  return 0;
}
