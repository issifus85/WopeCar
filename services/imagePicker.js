import * as ImagePicker from 'expo-image-picker';

/**
 * `source: 'camera' | 'library'`. Returns the picked file's local uri, or
 * null if the user cancels; throws a friendly Error if permission is denied
 * - this service layer owns no UI, same convention as
 * chatAttachmentsApi.pickAndUploadChatImage.
 */
export async function pickImage(source, options = {}) {
  const permission = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error(source === 'camera'
      ? 'Enable camera access in your device settings to take a photo.'
      : 'Enable photo library access in your device settings to attach a photo.');
  }

  const pickerOptions = { mediaTypes: ['images'], quality: 0.7, ...options };
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(pickerOptions)
    : await ImagePicker.launchImageLibraryAsync(pickerOptions);
  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0].uri;
}
