import React, { useState, useEffect } from 'react';
import { View, FlatList, Button } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { Image } from 'expo-image';
import { optimizeImage, useSyncImage } from '../../../libs/images';
import { Text } from '@kit/ui';
import { useSupabase } from '@kit/supabase';

const App = () => {
  const [images, setImages] = useState<MediaLibrary.Asset[]>([]);
  const syncImage = useSyncImage()
  const getPhotos = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status === 'granted') {
      const assets = await MediaLibrary.getAssetsAsync({
        first: 100,
        mediaType: ['photo'],
      });
      const imageUris = assets.assets.map((asset) => asset);
      setImages(imageUris);
    }
  };

  useEffect(() => {
    getPhotos();
  }, []);

  const renderItem = ({ item }: { item: MediaLibrary.Asset }) => (
    <View style={{ margin: 5 }}>
      <Image source={item} style={{ width: 100, height: 100, margin: 5 }} />
      <Text>{item.filename}</Text>
      <Button title="Sync Image" onPress={() => syncImage(item)} />
    </View>
  );

  return (
    <View>
      <UploadedImages />
      <FlatList
        data={images}
        renderItem={renderItem}
        keyExtractor={(item) => item.uri}
        numColumns={1}
      />
    </View>
  );
};

const UploadedImages = () => {
  const supabase = useSupabase();
  const [image, setImage] = useState<string>('')




  if (image) {
    return <Image onError={(e) => {
      console.error('Error loading image:', e);
      setImage('')}} style={{ width: 80, height: 80 }} source={{ uri: image }} />
  }

  return (
    <Button
      title="Fetch Uploaded Images"
      onPress={async () => {
        let user = ((await supabase.auth.getUser()).data.user);
        if (!user) {
          console.error('User not authenticated');
          return;
        }
        supabase.storage.from('user_images').list(user.id).then(({ data, error }) => {
          if (error) {
            console.error('Error fetching images:', error);
          } else {
            console.log('Fetched images:', data);
            let item = data[0];
            if (!item) {
              console.error('No images found for user:', user.id);
              return;
            }
            supabase.storage
              .from('user_images')
              .download(`${user.id}/${item.name}`)
              .then(({ data }) => {
                const fr = new FileReader();
                fr.readAsDataURL(data!);
                fr.onload = () => {
                  setImage(fr.result as string);
                };
              });
          }
        });
      }}
    />
  );
};
export default App;