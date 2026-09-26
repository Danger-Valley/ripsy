#!/usr/bin/env bash

set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mobile_directory="$(cd "${script_directory}/.." && pwd)"
source "${script_directory}/load-native-env.sh"

cd "${mobile_directory}"
exec react-native run-android "$@"
