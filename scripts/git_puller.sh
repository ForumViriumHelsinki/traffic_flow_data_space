#!/bin/zsh

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Find all directories containing a .git folder
# Zsh is compatible with this find command structure
find . -type d -name ".git" -prune | while read -r gitdir; do

    # Get the parent directory
    repo_dir=$(dirname "$gitdir")

    # Zsh echo handles escape characters (\n) by default, but -e is supported for compatibility
    echo -e "\n${BLUE}=========================================${NC}"
    echo -e "${BLUE}Updating: $repo_dir${NC}"
    echo -e "${BLUE}=========================================${NC}"

    (
        cd "$repo_dir"

        # Check if repo is dirty
        if [[ -n $(git status --porcelain) ]]; then
            echo -e "${GREEN}Note: Uncommitted changes detected in $repo_dir${NC}"
        fi

        git pull
    )
done
