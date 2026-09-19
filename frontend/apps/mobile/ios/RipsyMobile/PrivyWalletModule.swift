import Foundation
import PrivySDK
import React

@objc(PrivyWallet)
final class PrivyWalletModule: NSObject {
  private let configured: Bool
  private let privy: (any Privy)?

  override init() {
    let appId = Bundle.main.object(forInfoDictionaryKey: "PrivyAppId") as? String ?? ""
    let clientId = Bundle.main.object(forInfoDictionaryKey: "PrivyClientId") as? String ?? ""
    configured = !appId.isEmpty && !clientId.isEmpty
    if configured {
      privy = PrivySdk.initialize(config: PrivyConfig(
        appId: appId,
        appClientId: clientId,
        loggingConfig: PrivyLoggingConfig(logLevel: .none)
      ))
    } else {
      privy = nil
    }
    super.init()
  }

  // Privy reads UIKit/keychain-backed auth state during initialization. React
  // Native otherwise creates modules on its worker queue, which triggers a
  // libdispatch main-queue assertion as soon as the Shop requests auth state.
  @objc static func requiresMainQueueSetup() -> Bool { true }

  @objc(getState:rejecter:)
  func getState(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    run(resolve, reject) { [self] in
      guard let privy else { return stateDictionary(nil) }
      return stateDictionary(await privy.getAuthState())
    }
  }

  @objc(sendEmailCode:resolver:rejecter:)
  func sendEmailCode(
    _ email: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    run(resolve, reject) { [self] in
      try await requireConfigured().email.sendCode(to: email)
      return nil
    }
  }

  @objc(loginWithEmailCode:code:resolver:rejecter:)
  func loginWithEmailCode(
    _ email: String,
    code: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    run(resolve, reject) { [self] in
      let privy = try requireConfigured()
      _ = try await privy.email.loginWithCode(code, sentTo: email)
      return stateDictionary(await privy.getAuthState())
    }
  }

  @objc(createWallet:rejecter:)
  func createWallet(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    run(resolve, reject) { [self] in
      let privy = try requireConfigured()
      let user = try await authenticatedUser(privy)
      if user.embeddedSolanaWallets.isEmpty { _ = try await user.createSolanaWallet() }
      return stateDictionary(await privy.getAuthState())
    }
  }

  @objc(logout:rejecter:)
  func logout(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    run(resolve, reject) { [self] in
      let privy = try requireConfigured()
      if case .authenticated(let user) = await privy.getAuthState() { await user.logout() }
      return stateDictionary(await privy.getAuthState())
    }
  }

  @objc(signTransaction:buyer:resolver:rejecter:)
  func signTransaction(
    _ transactionBase64: String,
    buyer: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    run(resolve, reject) { [self] in
      let user = try await authenticatedUser(requireConfigured())
      guard let wallet = user.embeddedSolanaWallets.first(where: { $0.address == buyer }) else {
        throw WalletError.message("Reconnect the embedded wallet selected for this purchase.")
      }
      guard let transaction = Data(base64Encoded: transactionBase64) else {
        throw WalletError.message("The purchase transaction is invalid.")
      }
      return try await wallet.provider.signTransaction(transaction: transaction)
    }
  }

  private func requireConfigured() throws -> any Privy {
    guard let privy else { throw WalletError.message("Privy is not configured for this app build.") }
    return privy
  }

  private func authenticatedUser(_ privy: any Privy) async throws -> any PrivyUser {
    guard case .authenticated(let user) = await privy.getAuthState() else {
      throw WalletError.message("Sign in to your embedded wallet first.")
    }
    return user
  }

  private func stateDictionary(_ state: AuthState?) -> [String: Any] {
    var result: [String: Any] = [
      "configured": configured,
      "status": configured ? "unauthenticated" : "unavailable",
      "address": NSNull(),
      "userId": NSNull(),
    ]
    switch state {
    case .authenticated(let user):
      result["status"] = "authenticated"
      result["userId"] = user.id
      result["address"] = user.embeddedSolanaWallets.first?.address ?? NSNull()
    case .authenticatedUnverified, .notReady:
      result["status"] = "authenticated-unverified"
    default:
      break
    }
    return result
  }

  private func run(
    _ resolve: @escaping RCTPromiseResolveBlock,
    _ reject: @escaping RCTPromiseRejectBlock,
    operation: @escaping () async throws -> Any?
  ) {
    Task { @MainActor in
      do { resolve(try await operation()) }
      catch let error as WalletError { reject("PRIVY_WALLET_ERROR", error.localizedDescription, error) }
      catch { reject("PRIVY_WALLET_ERROR", "Wallet request failed. Please try again.", error) }
    }
  }
}

private enum WalletError: LocalizedError {
  case message(String)
  var errorDescription: String? {
    if case .message(let value) = self { return value }
    return nil
  }
}
