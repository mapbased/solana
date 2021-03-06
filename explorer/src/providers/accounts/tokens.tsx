import React from "react";
import { Connection, PublicKey, TokenAccountInfo } from "@solana/web3.js";
import { FetchStatus, useAccounts } from "./index";
import { useCluster } from "../cluster";

interface AccountTokens {
  status: FetchStatus;
  tokens?: TokenAccountInfo[];
}

interface Update {
  pubkey: PublicKey;
  status: FetchStatus;
  tokens?: TokenAccountInfo[];
}

type Action = Update | "clear";
type State = { [address: string]: AccountTokens };
type Dispatch = (action: Action) => void;

function reducer(state: State, action: Action): State {
  if (action === "clear") {
    return {};
  }

  const address = action.pubkey.toBase58();
  let addressEntry = state[address];
  if (addressEntry && action.status === FetchStatus.Fetching) {
    addressEntry = {
      ...addressEntry,
      status: FetchStatus.Fetching,
    };
  } else {
    addressEntry = {
      tokens: action.tokens,
      status: action.status,
    };
  }

  return {
    ...state,
    [address]: addressEntry,
  };
}

const StateContext = React.createContext<State | undefined>(undefined);
const DispatchContext = React.createContext<Dispatch | undefined>(undefined);

type ProviderProps = { children: React.ReactNode };
export function TokensProvider({ children }: ProviderProps) {
  const [state, dispatch] = React.useReducer(reducer, {});
  const { url } = useCluster();
  const { accounts, lastFetchedAddress } = useAccounts();

  React.useEffect(() => {
    dispatch("clear");
  }, [url]);

  // Fetch history for new accounts
  React.useEffect(() => {
    if (lastFetchedAddress) {
      const infoFetched =
        accounts[lastFetchedAddress] &&
        accounts[lastFetchedAddress].lamports !== undefined;
      const noRecord = !state[lastFetchedAddress];
      if (infoFetched && noRecord) {
        fetchAccountTokens(dispatch, new PublicKey(lastFetchedAddress), url);
      }
    }
  }, [accounts, lastFetchedAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenSVp5gheXUvJ6jGWGeCsgPKgnE3YgdGKRVCMY9o"
);

async function fetchAccountTokens(
  dispatch: Dispatch,
  pubkey: PublicKey,
  url: string
) {
  dispatch({
    status: FetchStatus.Fetching,
    pubkey,
  });

  let status;
  let tokens;
  try {
    const { value } = await new Connection(
      url,
      "recent"
    ).getTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID });
    tokens = value.map((accountInfo) => accountInfo.account.data);
    status = FetchStatus.Fetched;
  } catch (error) {
    status = FetchStatus.FetchFailed;
  }
  dispatch({ status, tokens, pubkey });
}

export function useAccountOwnedTokens(address: string) {
  const context = React.useContext(StateContext);

  if (!context) {
    throw new Error(
      `useAccountOwnedTokens must be used within a AccountsProvider`
    );
  }

  return context[address];
}

export function useFetchAccountOwnedTokens() {
  const dispatch = React.useContext(DispatchContext);
  if (!dispatch) {
    throw new Error(
      `useFetchAccountOwnedTokens must be used within a AccountsProvider`
    );
  }

  const { url } = useCluster();
  return (pubkey: PublicKey) => {
    fetchAccountTokens(dispatch, pubkey, url);
  };
}
