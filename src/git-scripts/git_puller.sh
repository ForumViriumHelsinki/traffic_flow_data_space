#!/bin/zsh

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Initialize variables
SWITCH_TO_MAIN=0
EXCLUDES=()

# Parse command-line arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        -m|--main)
            SWITCH_TO_MAIN=1
            shift
            ;;
        -e|--exclude)
            if [[ -n "$2" && "$2" != -* ]]; then
                EXCLUDES+=("$2")
                shift 2
            else
                echo -e "${YELLOW}Error: Directory name missing for $1${NC}" >&2
                exit 1
            fi
            ;;
        -h|--help)
            echo "Usage: $0 [-m|--main] [-e|--exclude <folder>]"
            echo "Options:"
            echo "  -m, --main               Switch to 'main' branch before pulling"
            echo "  -e, --exclude <folder>   Omit a specific folder (can be used multiple times)"
            echo "                           Example: $0 -e node_modules -e build"
            exit 0
            ;;
        *)
            echo "Unknown parameter passed: $1"
            echo "Use -h or --help for usage."
            exit 1
            ;;
    esac
done

# Build the find command arguments dynamically
FIND_ARGS=()

# If there are exclusions, add them to the find command to be pruned
if [[ ${#EXCLUDES[@]} -gt 0 ]]; then
    FIND_ARGS+=( -type d \( )
    first=1
    for dir in "${EXCLUDES[@]}"; do
        if [[ $first -eq 0 ]]; then
            FIND_ARGS+=( -o )
        fi
        FIND_ARGS+=( -name "$dir" )
        first=0
    done
    # Prune the excluded directories, then use -o (OR) to continue checking other paths
    FIND_ARGS+=( \) -prune -o )
fi

# Add the primary search criteria: find .git directories, prune them (stop descending), and print
FIND_ARGS+=( -type d -name ".git" -prune -print )

# Find all valid directories using the dynamically constructed arguments
find . "${FIND_ARGS[@]}" | while read -r gitdir; do

    # Get the parent directory
    repo_dir=$(dirname "$gitdir")

    echo -e "\n${BLUE}=========================================${NC}"
    echo -e "${BLUE}Updating: $repo_dir${NC}"
    echo -e "${BLUE}=========================================${NC}"

    (
        cd "$repo_dir" || exit

        # Check if repo is dirty
        if [[ -n $(git status --porcelain) ]]; then
            echo -e "${YELLOW}Note: Uncommitted changes detected in $repo_dir${NC}"
        fi

        # Switch to main branch if requested
        if [[ $SWITCH_TO_MAIN -eq 1 ]]; then
            echo -e "${BLUE}Switching to 'main' branch...${NC}"

            if git checkout main 2>/dev/null; then
                echo -e "${GREEN}Successfully switched to main.${NC}"
            else
                echo -e "${YELLOW}Warning: Could not switch to main. (Branch may not exist, or uncommitted changes prevented it). Pulling current branch instead.${NC}"
            fi
        fi

        git pull
    )
done
