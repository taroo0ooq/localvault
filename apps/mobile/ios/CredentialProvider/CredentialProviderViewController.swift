import AuthenticationServices

/// iOS Credential Provider extension (REQ-007).
/// Users enable LocalVault under Settings → Passwords → AutoFill Passwords.
/// Secrets are only offered after the main app has unlocked (App Group shared state).
class CredentialProviderViewController: ASCredentialProviderViewController {

    override func prepareCredentialList(for serviceIdentifiers: [ASCredentialServiceIdentifier]) {
        // Present UI or complete request with stored credentials from App Group.
        // S7 scaffold: complete with cancellation if vault locked.
        if !SharedVaultState.isUnlocked {
            self.extensionContext.cancelRequest(
                withError: NSError(
                    domain: ASExtensionErrorDomain,
                    code: ASExtensionError.userCanceled.rawValue
                )
            )
            return
        }
        // Host app populates SharedVaultState.entries after unlock.
        extensionContext.cancelRequest(
            withError: NSError(
                domain: ASExtensionErrorDomain,
                code: ASExtensionError.userInteractionRequired.rawValue
            )
        )
    }

    override func provideCredentialWithoutUserInteraction(
        for credentialIdentity: ASPasswordCredentialIdentity
    ) {
        guard SharedVaultState.isUnlocked,
              let secret = SharedVaultState.password(for: credentialIdentity.serviceIdentifier.identifier)
        else {
            self.extensionContext.cancelRequest(
                withError: NSError(
                    domain: ASExtensionErrorDomain,
                    code: ASExtensionError.userInteractionRequired.rawValue
                )
            )
            return
        }
        let credential = ASPasswordCredential(
            user: credentialIdentity.user,
            password: secret
        )
        self.extensionContext.completeRequest(
            withSelectedCredential: credential,
            completionHandler: nil
        )
    }
}

enum SharedVaultState {
    static let suite = UserDefaults(suiteName: "group.com.localvault.mobile")

    static var isUnlocked: Bool {
        suite?.bool(forKey: "unlocked") ?? false
    }

    static var entries: [[String: String]] {
        suite?.array(forKey: "entries") as? [[String: String]] ?? []
    }

    static func password(for service: String) -> String? {
        // Passwords are keyed only while unlocked; cleared on lock.
        suite?.string(forKey: "pw_\(service)")
    }
}
