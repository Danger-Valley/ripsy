/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { installBackgroundPushHandler } from './src/push-notifications';

installBackgroundPushHandler();

AppRegistry.registerComponent(appName, () => App);
